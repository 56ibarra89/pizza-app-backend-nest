import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
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

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  async list(
    @Query('scope') scope?: 'all' | 'todayOrActive',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const list = await this.orders.listByDateRange(start, end);
      return list.map(toOrderResponseDto);
    }
    
    const list = scope === 'all' ? await this.orders.listAll() : await this.orders.listTodayOrActive();
    return list.map(toOrderResponseDto);
  }

  @Get('driver/:driverId/today')
  @Roles(UserRoleDto.admin, UserRoleDto.cajero, UserRoleDto.mesero, UserRoleDto.motorizado)
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
    
    const list = await this.orders.listByDriverAndDate(driverId, startOfDay, endOfDay);
    return list.map(toOrderResponseDto);
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    const order = await this.orders.getById(id);
    return toOrderResponseDto(order);
  }

  @Post()
  @Roles(UserRoleDto.admin, UserRoleDto.cajero, UserRoleDto.mesero)
  async create(@Body() dto: CreateOrderDto) {
    const created = await this.orders.create(dto);
    return toOrderResponseDto(created);
  }

  @Patch(':id/status')
  @Roles(UserRoleDto.admin, UserRoleDto.cajero, UserRoleDto.mesero, UserRoleDto.cocinero)
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentUser() user: any,
  ) {
    const updated = await this.orders.updateStatus(id, dto, user);
    return toOrderResponseDto(updated);
  }

  @Patch(':id/items')
  @Roles(UserRoleDto.admin, UserRoleDto.cajero, UserRoleDto.mesero)
  async updateItems(
    @Param('id') id: string,
    @Body() dto: UpdateOrderItemsDto,
    @CurrentUser() user: any,
  ) {
    const updated = await this.orders.updateItems(id, dto, user);
    return toOrderResponseDto(updated);
  }

  @Patch(':id/tables')
  @Roles(UserRoleDto.admin, UserRoleDto.cajero, UserRoleDto.mesero)
  async updateTables(@Param('id') id: string, @Body('tableIds') tableIds: string[]) {
    const updated = await this.orders.updateTables(id, tableIds);
    return toOrderResponseDto(updated);
  }

  @Patch(':id/finalize')
  @Roles(UserRoleDto.admin, UserRoleDto.cajero, UserRoleDto.mesero)
  async finalize(
    @Param('id') id: string,
    @Body() dto: FinalizeOrderDto,
    @CurrentUser() user: any,
  ) {
    const updated = await this.orders.finalize(id, dto, user);
    return toOrderResponseDto(updated);
  }
}
