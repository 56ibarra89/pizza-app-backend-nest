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
import { FinalizeOrderDto } from '../dto/finalize-order.dto';
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

    const list = await this.orders.listTodayOrActive();
    return this.toVisibleOrderResponses(list, user);
  }

  @Get('history')
  async listHistory(@Query() query: ListOrderHistoryQueryDto) {
    const result = await this.orders.listHistory({
      startDate: new Date(query.startDate),
      endDate: new Date(query.endDate),
      page: query.page,
      pageSize: query.pageSize,
      search: query.search,
      paymentMethodId: query.paymentMethodId,
      view: query.view,
      statuses: query.statuses as OrderStatusDto[] | undefined,
    });
    return {
      items: result.items.map(toOrderResponseDto),
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
  ) {
    const responses = orders.map(toOrderResponseDto);
    if (user?.role !== UserRoleDto.cocinero) return responses;

    const kitchenId = await this.kitchens.getAssignedKitchenIdForDate(user.id);
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
  @Roles(UserRoleDto.admin, UserRoleDto.despachador, UserRoleDto.motorizado)
  async getDriverTodayOrders(
    @Param('driverId') driverId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('date') dateStr?: string,
  ) {
    let dateToUse = dateStr;
    if (!dateToUse) {
      const now = new Date();
      dateToUse = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    }
    const [year, month, day] = dateToUse.split('-').map(Number);
    const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0);
    const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);

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
    @Body('ticketIds') ticketIds: string[],
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.orders.addHiddenKitchenTickets(ticketIds, user);
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
    const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const start = startDate ? new Date(startDate) : defaultStart;
    const end = endDate ? new Date(endDate) : now;
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
    return this.orders.getPaymentMetrics(
      startDate
        ? new Date(startDate)
        : new Date(now.getFullYear(), now.getMonth(), 1),
      endDate ? new Date(endDate) : now,
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
    @Body('tableIds') tableIds: string[],
  ) {
    const updated = await this.orders.updateTables(id, tableIds);
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

  private async getVisibleOrderResponse(
    order: OrderEntity,
    user: AuthenticatedUser,
  ) {
    const [response] = await this.toVisibleOrderResponses([order], user);
    if (!response) {
      throw new ForbiddenException(
        'No tienes acceso a esta orden desde la cocina asignada.',
      );
    }
    return response;
  }
}
