import {
  Body,
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
import { UserRoleDto } from '../../users/dto/user-role.dto';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { KitchensService } from '../../kitchens/kitchens.service';
import type { OrderEntity } from '../entities/order.entity';
import { requiresKitchenPreparation } from '../validators/order-item-kind';

@ApiTags('orders')
@Controller('orders')
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
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const list = await this.orders.listByDateRange(start, end);
      return this.toVisibleOrderResponses(list, user);
    }

    const list =
      scope === 'all'
        ? await this.orders.listAll()
        : await this.orders.listTodayOrActive();
    return this.toVisibleOrderResponses(list, user);
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
          requiresKitchenPreparation(item) && item.kitchenId === kitchenId,
      );
      if (!hasAssignedKitchenItem) return [];

      return [
        {
          ...order,
          items: order.items.filter(
            (item) =>
              !requiresKitchenPreparation(item) || item.kitchenId === kitchenId,
          ),
        },
      ];
    });
  }

  @Get('driver/:driverId/today')
  @Roles(
    UserRoleDto.admin,
    UserRoleDto.cajero,
    UserRoleDto.mesero,
    UserRoleDto.despachador,
    UserRoleDto.motorizado,
  )
  async getDriverTodayOrders(
    @Param('driverId') driverId: string,
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

    const list = await this.orders.listByDriverAndDate(
      driverId,
      startOfDay,
      endOfDay,
    );
    return list.map(toOrderResponseDto);
  }

  @Get('kitchen/hidden-tickets')
  @Roles(
    UserRoleDto.admin,
    UserRoleDto.cajero,
    UserRoleDto.cocinero,
    UserRoleDto.despachador,
  )
  async getHiddenKitchenTickets() {
    return this.orders.getHiddenKitchenTickets();
  }

  @Post('kitchen/hidden-tickets')
  @Roles(
    UserRoleDto.admin,
    UserRoleDto.cajero,
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

  @Get(':id')
  async getById(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const order = await this.orders.getById(id);
    return this.getVisibleOrderResponse(order, user);
  }

  @Post()
  @Roles(
    UserRoleDto.admin,
    UserRoleDto.cajero,
    UserRoleDto.cajero_principal,
    UserRoleDto.mesero,
    UserRoleDto.despachador,
  )
  async create(@Body() dto: CreateOrderDto) {
    const created = await this.orders.create(dto);
    return toOrderResponseDto(created);
  }

  @Patch(':id/status')
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
    const updated = await this.orders.updateStatus(id, dto, user);
    return this.getVisibleOrderResponse(updated, user);
  }

  @Patch(':id/items')
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
