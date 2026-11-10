import {
  Body,
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { OrdersService } from '../services/orders.service';
import { CreateOrderDto } from '../dto/create-order.dto';
import { UpdateOrderStatusDto } from '../dto/update-order-status.dto';
import { UpdateOrderItemsDto } from '../dto/update-order-items.dto';
import { UpdateOrderTablesDto } from '../dto/update-order-tables.dto';
import { FinalizeOrderDto } from '../dto/finalize-order.dto';
import { SplitOrderCheckoutDto } from '../dto/split-order-checkout.dto';
import { toOrderResponseDto } from '../mappers/orders.mapper';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions, UserRoleDto } from '../../common';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { KitchensService } from '../../kitchens/kitchens.service';
import type { OrderEntity } from '../entities/order.entity';
import { requiresKitchenPreparation } from '../validators/order-item-kind';
import { ListOrderHistoryQueryDto } from '../dto/list-order-history-query.dto';
import { OrderStatusDto } from '../dto/order-status.dto';
import { HideKitchenTicketsDto } from '../dto/hide-kitchen-tickets.dto';
import { UpdateOrderWaiterDto } from '../dto/update-order-waiter.dto';
import {
  getBusinessDateParts,
  getBusinessDayBounds,
} from '../../common/time/business-time.util';

@ApiTags('orders')
@Controller('orders')
@Permissions('orders.read')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly kitchens: KitchensService,
  ) {}

  @Get()
  async list(
    @Query('scope') scope?: 'all' | 'todayOrActive',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    if (startDate || endDate) {
      throw new BadRequestException(
        'Las consultas históricas deben utilizar /orders/history con paginación.',
      );
    }

    if (scope === 'all') {
      throw new BadRequestException(
        'La consulta completa de órdenes no está permitida; utiliza /orders/history.',
      );
    }

    let kitchenId: string | undefined;
    if (user?.role === UserRoleDto.cocinero) {
      const assignedKitchenId = await this.kitchens.getAssignedKitchenIdForDate(
        user.id,
      );
      if (!assignedKitchenId) {
        return [];
      }
      kitchenId = assignedKitchenId;
    }

    const driverId =
      user?.role === UserRoleDto.motorizado ? user.id : undefined;

    const list = await this.orders.listTodayOrActive(new Date(), {
      driverId,
      kitchenId,
    });
    return this.toVisibleOrderResponses(list, user, kitchenId);
  }

  @Get('history')
  async listHistory(
    @Query() query: ListOrderHistoryQueryDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    let kitchenId: string | undefined;
    if (user?.role === UserRoleDto.cocinero) {
      const assignedKitchenId = await this.kitchens.getAssignedKitchenIdForDate(
        user.id,
      );
      if (!assignedKitchenId) {
        return {
          items: [],
          total: 0,
          page: query.page,
          pageSize: query.pageSize,
          totalPages: 0,
          paymentMethodOptions: [],
        };
      }
      kitchenId = assignedKitchenId;
    }

    const driverId =
      user?.role === UserRoleDto.motorizado ? user.id : undefined;

    const result = await this.orders.listHistory({
      startDate: new Date(query.startDate),
      endDate: new Date(query.endDate),
      page: query.page,
      pageSize: query.pageSize,
      search: query.search,
      paymentMethodId: query.paymentMethodId,
      view: query.view,
      statuses: query.statuses as OrderStatusDto[] | undefined,
      driverId,
      kitchenId,
    });
    const visibleItems = await this.toVisibleOrderResponses(
      result.items,
      user,
      kitchenId,
    );
    return {
      items: visibleItems,
      total: result.total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(result.total / query.pageSize),
      paymentMethodOptions: result.paymentMethodOptions,
    };
  }

  private async toVisibleOrderResponses(
    orders: OrderEntity[],
    user?: AuthenticatedUser,
    resolvedKitchenId?: string,
  ) {
    const responses = orders.map(toOrderResponseDto);
    if (user?.role === UserRoleDto.motorizado) {
      return responses.filter(
        (order) => order.orderType === 'delivery' && order.driverId === user.id,
      );
    }
    if (user?.role !== UserRoleDto.cocinero) return responses;

    const kitchenId =
      resolvedKitchenId ??
      (await this.kitchens.getAssignedKitchenIdForDate(user.id));
    if (!kitchenId) return [];

    return responses.flatMap((order) => {
      const hasAssignedKitchenItem = order.items.some(
        (item) =>
          requiresKitchenPreparation(item) &&
          (item.kitchenId === kitchenId ||
            (item.isCombo &&
              Array.isArray(item.comboSelections) &&
              item.comboSelections.some(
                (sel: any) => sel.kitchenId === kitchenId,
              ))),
      );
      if (!hasAssignedKitchenItem) return [];

      return [
        {
          ...order,
          items: order.items.filter(
            (item) =>
              !requiresKitchenPreparation(item) ||
              item.kitchenId === kitchenId ||
              (item.isCombo &&
                Array.isArray(item.comboSelections) &&
                item.comboSelections.some(
                  (sel: any) => sel.kitchenId === kitchenId,
                )),
          ),
        },
      ];
    });
  }

  @Get('driver/:driverId/today')
  @Permissions('delivery.read')
  @Roles(
    UserRoleDto.admin,
    UserRoleDto.cajero,
    UserRoleDto.cajero_principal,
    UserRoleDto.despachador,
    UserRoleDto.motorizado,
  )
  async getDriverTodayOrders(
    @Param('driverId') driverId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('date') dateStr?: string,
  ) {
    let startOfDay: Date;
    let endOfDay: Date;
    try {
      const bounds = getBusinessDayBounds(dateStr ?? new Date());
      startOfDay = bounds.startOfDay;
      endOfDay = bounds.endOfDay;
    } catch {
      throw new BadRequestException(
        'La fecha debe usar el formato YYYY-MM-DD.',
      );
    }

    const effectiveDriverId =
      user.role === UserRoleDto.motorizado ? user.id : driverId;

    const list = await this.orders.listByDriverAndDate(
      effectiveDriverId,
      startOfDay,
      endOfDay,
    );
    return list.map(toOrderResponseDto);
  }

  @Get('kitchen/hidden-tickets')
  @Permissions('kitchen.read')
  @Roles(
    UserRoleDto.admin,
    UserRoleDto.cajero,
    UserRoleDto.cajero_principal,
    UserRoleDto.cocinero,
    UserRoleDto.despachador,
  )
  async getHiddenKitchenTickets() {
    return this.orders.getHiddenKitchenTickets();
  }

  @Post('kitchen/hidden-tickets')
  @Permissions('kitchen.update')
  @Roles(
    UserRoleDto.admin,
    UserRoleDto.cajero,
    UserRoleDto.cajero_principal,
    UserRoleDto.cocinero,
    UserRoleDto.despachador,
  )
  async addHiddenKitchenTickets(
    @Body() body: HideKitchenTicketsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.orders.addHiddenKitchenTickets(body.ticketIds, user);
    return { success: true };
  }

  @Get('sla/metrics')
  @Permissions('reports.read')
  @Roles(UserRoleDto.admin)
  getSlaMetrics(@Query('days') days?: string) {
    return this.orders.getSlaMetrics(Number(days) || 30);
  }

  @Get('cancellations/metrics')
  @Permissions('reports.read')
  @Roles(UserRoleDto.admin)
  getCancellationMetrics(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const now = new Date();
    const { year, month } = getBusinessDateParts(now);
    const defaultStart = getBusinessDayBounds(
      `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`,
    ).startOfDay;
    const start = startDate
      ? /^\d{4}-\d{2}-\d{2}$/.test(startDate.trim())
        ? getBusinessDayBounds(startDate.trim()).startOfDay
        : new Date(startDate)
      : defaultStart;
    const end = endDate
      ? /^\d{4}-\d{2}-\d{2}$/.test(endDate.trim())
        ? getBusinessDayBounds(endDate.trim()).endOfDay
        : new Date(endDate)
      : now;
    return this.orders.getCancellationMetrics(start, end);
  }

  @Get('payments/metrics')
  @Permissions('reports.read')
  @Roles(UserRoleDto.admin)
  getPaymentMetrics(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const now = new Date();
    const { year, month } = getBusinessDateParts(now);
    const defaultStart = getBusinessDayBounds(
      `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`,
    ).startOfDay;
    return this.orders.getPaymentMetrics(
      startDate
        ? /^\d{4}-\d{2}-\d{2}$/.test(startDate.trim())
          ? getBusinessDayBounds(startDate.trim()).startOfDay
          : new Date(startDate)
        : defaultStart,
      endDate
        ? /^\d{4}-\d{2}-\d{2}$/.test(endDate.trim())
          ? getBusinessDayBounds(endDate.trim()).endOfDay
          : new Date(endDate)
        : now,
    );
  }

  @Get(':id')
  async getById(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const order = await this.orders.getById(id);
    return this.getVisibleOrderResponse(order, user);
  }

  @Post()
  @Permissions('orders.manage')
  @Roles(
    UserRoleDto.admin,
    UserRoleDto.cajero,
    UserRoleDto.cajero_principal,
    UserRoleDto.mesero,
    UserRoleDto.despachador,
  )
  async create(
    @Body() dto: CreateOrderDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    const created = await this.orders.create(dto, user);
    return toOrderResponseDto(created);
  }

  @Patch(':id/waiter')
  @Permissions('tables.operate')
  @Roles(
    UserRoleDto.admin,
    UserRoleDto.cajero,
    UserRoleDto.cajero_principal,
    UserRoleDto.mesero,
    UserRoleDto.despachador,
  )
  async assignWaiter(
    @Param('id') id: string,
    @Body() dto: UpdateOrderWaiterDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const updated = await this.orders.assignWaiter(id, dto.waiterId, user);
    return toOrderResponseDto(updated);
  }

  @Patch(':id/status')
  @Permissions('orders.status')
  @Roles(
    UserRoleDto.admin,
    UserRoleDto.cajero,
    UserRoleDto.cajero_principal,
    UserRoleDto.mesero,
    UserRoleDto.cocinero,
    UserRoleDto.despachador,
    UserRoleDto.motorizado,
  )
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (
      dto.status === 'cancelled' &&
      !user.permissions?.includes('orders.cancel')
    ) {
      throw new ForbiddenException('No tienes permiso para cancelar órdenes.');
    }
    const updated = await this.orders.updateStatus(id, dto, user);
    return this.getVisibleOrderResponse(updated, user);
  }

  @Patch(':id/start-delivery')
  @Permissions('delivery.read')
  @Roles(
    UserRoleDto.admin,
    UserRoleDto.cajero,
    UserRoleDto.cajero_principal,
    UserRoleDto.despachador,
    UserRoleDto.motorizado,
  )
  async startDelivery(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const updated = await this.orders.startDelivery(id, user);
    return toOrderResponseDto(updated);
  }

  @Patch(':id/items')
  @Permissions('orders.manage')
  @Roles(
    UserRoleDto.admin,
    UserRoleDto.cajero,
    UserRoleDto.cajero_principal,
    UserRoleDto.mesero,
    UserRoleDto.despachador,
  )
  async updateItems(@Param('id') id: string, @Body() dto: UpdateOrderItemsDto) {
    const updated = await this.orders.updateItems(id, dto);
    return toOrderResponseDto(updated);
  }

  @Patch(':id/tables')
  @Permissions('tables.operate')
  @Roles(
    UserRoleDto.admin,
    UserRoleDto.cajero,
    UserRoleDto.cajero_principal,
    UserRoleDto.mesero,
    UserRoleDto.despachador,
  )
  async updateTables(
    @Param('id') id: string,
    @Body() dto: UpdateOrderTablesDto,
  ) {
    const updated = await this.orders.updateTables(id, dto.tableIds);
    return toOrderResponseDto(updated);
  }

  @Patch(':id/finalize')
  @Permissions('orders.finalize')
  @Roles(
    UserRoleDto.admin,
    UserRoleDto.cajero,
    UserRoleDto.cajero_principal,
    UserRoleDto.mesero,
    UserRoleDto.despachador,
    UserRoleDto.motorizado,
  )
  async finalize(
    @Param('id') id: string,
    @Body() dto: FinalizeOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const updated = await this.orders.finalize(id, dto, user);
    return toOrderResponseDto(updated);
  }

  @Post(':id/split-checkout')
  @Permissions('orders.finalize')
  @Roles(
    UserRoleDto.admin,
    UserRoleDto.cajero,
    UserRoleDto.cajero_principal,
    UserRoleDto.mesero,
    UserRoleDto.despachador,
  )
  async splitCheckout(
    @Param('id') id: string,
    @Body() dto: SplitOrderCheckoutDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const result = await this.orders.splitCheckout(id, dto, user);
    return {
      paidOrder: toOrderResponseDto(result.paidOrder),
      parentOrder: toOrderResponseDto(result.parentOrder),
    };
  }

  private async getVisibleOrderResponse(
    order: OrderEntity,
    user: AuthenticatedUser,
  ) {
    const [response] = await this.toVisibleOrderResponses([order], user);
    if (!response) {
      throw new ForbiddenException(
        user?.role === UserRoleDto.motorizado
          ? 'No tienes acceso a pedidos que no están asignados a tu usuario.'
          : 'No tienes acceso a esta orden desde la cocina asignada.',
      );
    }
    return response;
  }
}
