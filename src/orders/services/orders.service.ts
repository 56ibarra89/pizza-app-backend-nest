import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ORDERS_REPOSITORY,
  type IOrdersRepository,
} from '../interfaces/orders.repository';
import type { CreateOrderDto } from '../dto/create-order.dto';
import type { UpdateOrderStatusDto } from '../dto/update-order-status.dto';
import type { UpdateOrderItemsDto } from '../dto/update-order-items.dto';
import type { FinalizeOrderDto } from '../dto/finalize-order.dto';
import { OrderStatusDto } from '../dto/order-status.dto';
import { KitchenStatusDto } from '../dto/kitchen-status.dto';
import type { CartItemEntity } from '../entities/order-item.entity';

@Injectable()
export class OrdersService {
  constructor(
    @Inject(ORDERS_REPOSITORY) private readonly repo: IOrdersRepository,
    private readonly prisma: PrismaService,
  ) {}

  listTodayOrActive(now = new Date()) {
    return this.repo.listTodayOrActive(now);
  }

  listAll() {
    return this.repo.listAll();
  }

  async getById(id: string) {
    const found = await this.repo.findById(id);
    if (!found) throw new NotFoundException('Orden no encontrada');
    return found;
  }

  async create(dto: CreateOrderDto) {
    const status = dto.status ?? (dto.paymentMethod ? OrderStatusDto.paid : OrderStatusDto.pending);
    const timestamp = dto.timestamp ?? new Date();
    const isSentToKitchen = dto.isSentToKitchen ?? !dto.tableId;

    const customerId = dto.customerId ?? (await this.tryResolveCustomerId(dto.customerName));
    const cashierId = dto.cashierId ?? (await this.tryResolveCashierId(dto.cashierName));

    return this.repo.create({
      id: dto.id,
      shiftId: dto.shiftId,
      customerId,
      items: dto.items,
      subTotal: dto.subTotal,
      taxAmount: dto.taxAmount,
      total: dto.total,
      status,
      timestamp,
      customerName: dto.customerName,
      customerAddress: dto.customerAddress,
      orderType: dto.orderType,
      tableId: dto.tableId,
      paymentMethod: dto.paymentMethod,
      splitAmounts: dto.splitAmounts,
      cashierId,
      cashierName: dto.cashierName,
      isSentToKitchen,
      linkedTables: dto.linkedTables,
    });
  }

  private async tryResolveCustomerId(customerName?: string): Promise<string | undefined> {
    if (!customerName) return undefined;
    const nameLower = customerName.trim().toLowerCase();
    if (!nameLower) return undefined;

    const found = await this.prisma.customer.findUnique({
      where: { nameLower },
      select: { id: true },
    });
    return found?.id;
  }

  private async tryResolveCashierId(cashierName?: string): Promise<string | undefined> {
    if (!cashierName) return undefined;
    const username = cashierName.trim();
    if (!username) return undefined;

    const direct = await this.prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });
    if (direct) return direct.id;

    const lowered = username.toLowerCase();
    if (lowered !== username) {
      const alt = await this.prisma.user.findUnique({
        where: { username: lowered },
        select: { id: true },
      });
      return alt?.id;
    }

    return undefined;
  }

  async updateStatus(id: string, dto: UpdateOrderStatusDto) {
    const existing = await this.getById(id);
    const isFinal = existing.status === OrderStatusDto.paid || existing.status === OrderStatusDto.cancelled;

    if (dto.sentAt) {
      if (dto.status === OrderStatusDto.paid || dto.status === OrderStatusDto.cancelled) {
        throw new BadRequestException('Status inválido para cocina');
      }

      await this.repo.updateItemsKitchenStatus({
        orderId: id,
        sentAt: new Date(dto.sentAt),
        kitchenStatus: dto.status as unknown as KitchenStatusDto,
      });

      const reloaded = await this.getById(id);
      if (isFinal) return reloaded;

      const derived = this.deriveGlobalStatus(reloaded.items);
      return this.repo.update(id, { status: derived });
    }

    if (isFinal) return existing;

    const nextStatus = dto.status;
    const updateItemsKitchen = this.asKitchenStatusOrUndefined(nextStatus);

    const items = updateItemsKitchen
      ? existing.items.map((i) => ({ ...i, kitchenStatus: updateItemsKitchen }))
      : existing.items;

    return this.repo.update(id, { status: nextStatus, items });
  }

  async updateItems(id: string, dto: UpdateOrderItemsDto) {
    const existing = await this.getById(id);
    const isFinal = existing.status === OrderStatusDto.paid || existing.status === OrderStatusDto.cancelled;

    const nextStatus = isFinal ? existing.status : this.deriveStatusAfterItemsChange(existing, dto.items);

    return this.repo.update(id, {
      items: dto.items,
      total: dto.total,
      subTotal: dto.subTotal === undefined ? undefined : dto.subTotal,
      taxAmount: dto.taxAmount === undefined ? undefined : dto.taxAmount,
      status: nextStatus,
    });
  }

  async finalize(id: string, dto: FinalizeOrderDto) {
    await this.getById(id);

    return this.repo.update(id, {
      status: OrderStatusDto.paid,
      paymentMethod: dto.paymentMethod,
      splitAmounts: dto.splitAmounts ?? null,
      customerName: dto.customerName ?? undefined,
      customerAddress: dto.customerAddress ?? undefined,
      orderType: dto.orderType ?? undefined,
      total: dto.finalTotal,
      subTotal: dto.subTotal === undefined ? undefined : dto.subTotal,
      taxAmount: dto.taxAmount === undefined ? undefined : dto.taxAmount,
    });
  }

  private deriveGlobalStatus(items: CartItemEntity[]): OrderStatusDto {
    const sentItems = items.filter((i) => i.isSentToKitchen);

    const allDelivered =
      items.length > 0 &&
      items.every((i) => i.kitchenStatus === KitchenStatusDto.delivered || !i.isSentToKitchen);
    const anyPending = sentItems.some((i) => i.kitchenStatus === KitchenStatusDto.pending);
    const anyPreparing = sentItems.some((i) => i.kitchenStatus === KitchenStatusDto.preparing);
    const anyReady = sentItems.some((i) => i.kitchenStatus === KitchenStatusDto.ready);

    if (allDelivered) return OrderStatusDto.delivered;
    if (anyPending) return OrderStatusDto.pending;
    if (anyPreparing) return OrderStatusDto.preparing;
    if (anyReady) return OrderStatusDto.ready;
    return OrderStatusDto.pending;
  }

  private deriveStatusAfterItemsChange(existing: { status: OrderStatusDto }, items: CartItemEntity[]) {
    const hasNewItems = items.some((i) => !i.isSentToKitchen);
    const sentItems = items.filter((i) => i.isSentToKitchen);

    const allDelivered =
      sentItems.length > 0 &&
      sentItems.every((i) => i.kitchenStatus === KitchenStatusDto.delivered);
    const anyPreparing = sentItems.some((i) => i.kitchenStatus === KitchenStatusDto.preparing);
    const anyReady = sentItems.some((i) => i.kitchenStatus === KitchenStatusDto.ready);

    let newStatus = existing.status;
    if (hasNewItems) newStatus = OrderStatusDto.pending;
    else if (allDelivered) newStatus = OrderStatusDto.delivered;
    else if (anyReady) newStatus = OrderStatusDto.ready;
    else if (anyPreparing) newStatus = OrderStatusDto.preparing;

    return newStatus;
  }

  private asKitchenStatusOrUndefined(status: OrderStatusDto): KitchenStatusDto | undefined {
    switch (status) {
      case OrderStatusDto.pending:
        return KitchenStatusDto.pending;
      case OrderStatusDto.preparing:
        return KitchenStatusDto.preparing;
      case OrderStatusDto.ready:
        return KitchenStatusDto.ready;
      case OrderStatusDto.delivered:
        return KitchenStatusDto.delivered;
      default:
        return undefined;
    }
  }
}
