import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { OrdersService } from '../services/orders.service';
import { CreateOrderDto } from '../dto/create-order.dto';
import { UpdateOrderStatusDto } from '../dto/update-order-status.dto';
import { UpdateOrderItemsDto } from '../dto/update-order-items.dto';
import { FinalizeOrderDto } from '../dto/finalize-order.dto';
import { toOrderResponseDto } from '../mappers/orders.mapper';

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  async list(@Query('scope') scope?: 'all' | 'todayOrActive') {
    const list = scope === 'all' ? await this.orders.listAll() : await this.orders.listTodayOrActive();
    return list.map(toOrderResponseDto);
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    const order = await this.orders.getById(id);
    return toOrderResponseDto(order);
  }

  @Post()
  async create(@Body() dto: CreateOrderDto) {
    const created = await this.orders.create(dto);
    return toOrderResponseDto(created);
  }

  @Patch(':id/status')
  async updateStatus(@Param('id') id: string, @Body() dto: UpdateOrderStatusDto) {
    const updated = await this.orders.updateStatus(id, dto);
    return toOrderResponseDto(updated);
  }

  @Patch(':id/items')
  async updateItems(@Param('id') id: string, @Body() dto: UpdateOrderItemsDto) {
    const updated = await this.orders.updateItems(id, dto);
    return toOrderResponseDto(updated);
  }

  @Patch(':id/finalize')
  async finalize(@Param('id') id: string, @Body() dto: FinalizeOrderDto) {
    const updated = await this.orders.finalize(id, dto);
    return toOrderResponseDto(updated);
  }
}
