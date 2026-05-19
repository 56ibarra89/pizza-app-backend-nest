import { Injectable } from '@nestjs/common';
import { Prisma, type KitchenStatus, type OrderStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { IOrdersRepository } from '../interfaces/orders.repository';
import type { OrderEntity } from '../entities/order.entity';
import type { CartItemEntity } from '../entities/order-item.entity';
import type { KitchenStatusDto } from '../dto/kitchen-status.dto';
import {
  fromDbKitchenStatus,
  fromDbOrderStatus,
  fromDbOrderType,
  fromDbPaymentMethod,
  fromDbSize,
  toDbKitchenStatus,
  toDbOrderStatus,
  toDbOrderType,
  toDbPaymentMethod,
  toDbSize,
} from '../mappers/status.mapper';

@Injectable()
export class PrismaOrdersRepository implements IOrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listTodayOrActive(now: Date): Promise<OrderEntity[]> {
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    const orders = await this.prisma.order.findMany({
      where: {
        OR: [
          { timestamp: { gte: startOfDay } },
          { status: { notIn: ['PAID', 'CANCELLED'] satisfies OrderStatus[] } },
        ],
      },
      include: {
        items: { include: { extras: true }, orderBy: { id: 'asc' } },
        linkedTables: { select: { tableId: true } },
      },
      orderBy: { timestamp: 'desc' },
    });

    return orders.map((o) => this.mapOrder(o));
  }

  async listAll(): Promise<OrderEntity[]> {
    const orders = await this.prisma.order.findMany({
      include: {
        items: { include: { extras: true }, orderBy: { id: 'asc' } },
        linkedTables: { select: { tableId: true } },
      },
      orderBy: { timestamp: 'desc' },
    });
    return orders.map((o) => this.mapOrder(o));
  }

  async findById(id: string): Promise<OrderEntity | null> {
    const found = await this.prisma.order.findUnique({
      where: { id },
      include: {
        items: { include: { extras: true }, orderBy: { id: 'asc' } },
        linkedTables: { select: { tableId: true } },
      },
    });
    return found ? this.mapOrder(found) : null;
  }

  async create(data: {
    id?: string;
    shiftId?: string;
    customerId?: string;
    items: CartItemEntity[];
    subTotal?: number;
    taxAmount?: number;
    total: number;
    status: import('../dto/order-status.dto').OrderStatusDto;
    timestamp: Date;
    customerName?: string;
    customerAddress?: string;
    orderType?: import('../dto/order-type.dto').OrderTypeDto;
    tableId?: string;
    paymentMethod?: import('../dto/payment-method.dto').PaymentMethodDto;
    splitAmounts?: { efectivo: number; tarjeta: number };
    cashierId?: string;
    cashierName?: string;
    isSentToKitchen?: boolean;
    linkedTables?: string[];
  }): Promise<OrderEntity> {
    const uniqueLinkedTables = Array.from(new Set((data.linkedTables ?? []).filter(Boolean)));

    const created = await this.prisma.order.create({
      data: {
        ...(data.id ? { id: data.id } : {}),
        shiftId: data.shiftId,
        customerId: data.customerId,
        subTotal: data.subTotal,
        taxAmount: data.taxAmount,
        total: data.total,
        status: toDbOrderStatus(data.status),
        timestamp: data.timestamp,

        customerName: data.customerName,
        customerAddress: data.customerAddress,
        orderType: data.orderType ? toDbOrderType(data.orderType) : undefined,
        tableId: data.tableId,
        paymentMethod: data.paymentMethod ? toDbPaymentMethod(data.paymentMethod) : undefined,
        splitEfectivo: data.splitAmounts?.efectivo,
        splitTarjeta: data.splitAmounts?.tarjeta,
        cashierId: data.cashierId,
        cashierName: data.cashierName,
        isSentToKitchen: data.isSentToKitchen ?? false,
        ...(uniqueLinkedTables.length
          ? {
              linkedTables: {
                create: uniqueLinkedTables.map((tableId) => ({ tableId })),
              },
            }
          : {}),

        items: {
          create: data.items.map((i) => ({
            productId: i.productId,
            name: i.name,
            price: i.price,
            size: toDbSize(i.size),
            quantity: i.quantity,
            note: i.note,
            giftQuantity: i.giftQuantity,
            isSentToKitchen: i.isSentToKitchen ?? false,
            sentAt: i.sentAt ? new Date(i.sentAt) : undefined,
            kitchenStatus: i.kitchenStatus ? toDbKitchenStatus(i.kitchenStatus) : undefined,
            extras: {
              create: i.extras.map((e) => ({ name: e.name, price: e.price })),
            },
          })),
        },
      },
      include: {
        items: { include: { extras: true }, orderBy: { id: 'asc' } },
        linkedTables: { select: { tableId: true } },
      },
    });

    return this.mapOrder(created);
  }

  async update(
    id: string,
    data: {
      items?: CartItemEntity[];
      subTotal?: number | null;
      taxAmount?: number | null;
      total?: number;
      status?: import('../dto/order-status.dto').OrderStatusDto;
      shiftId?: string | null;
      customerId?: string | null;
      customerName?: string | null;
      customerAddress?: string | null;
      orderType?: import('../dto/order-type.dto').OrderTypeDto | null;
      tableId?: string | null;
      paymentMethod?: import('../dto/payment-method.dto').PaymentMethodDto | null;
      splitAmounts?: { efectivo: number; tarjeta: number } | null;
      cashierId?: string | null;
      cashierName?: string | null;
      isSentToKitchen?: boolean;
      linkedTables?: string[];
    },
  ): Promise<OrderEntity> {
    const updateData: Prisma.OrderUpdateInput = {
      subTotal: data.subTotal === undefined ? undefined : data.subTotal,
      taxAmount: data.taxAmount === undefined ? undefined : data.taxAmount,
      total: data.total,
      status: data.status ? toDbOrderStatus(data.status) : undefined,
      shift:
        data.shiftId === undefined
          ? undefined
          : data.shiftId
            ? { connect: { id: data.shiftId } }
            : { disconnect: true },
      customer:
        data.customerId === undefined
          ? undefined
          : data.customerId
            ? { connect: { id: data.customerId } }
            : { disconnect: true },
      customerName: data.customerName === undefined ? undefined : data.customerName,
      customerAddress: data.customerAddress === undefined ? undefined : data.customerAddress,
      orderType:
        data.orderType === undefined
          ? undefined
          : data.orderType
            ? toDbOrderType(data.orderType)
            : null,
      mesa:
        data.tableId === undefined
          ? undefined
          : data.tableId
            ? { connect: { id: data.tableId } }
            : { disconnect: true },
      paymentMethod:
        data.paymentMethod === undefined
          ? undefined
          : data.paymentMethod
            ? toDbPaymentMethod(data.paymentMethod)
            : null,
      splitEfectivo:
        data.splitAmounts === undefined
          ? undefined
          : data.splitAmounts
            ? data.splitAmounts.efectivo
            : null,
      splitTarjeta:
        data.splitAmounts === undefined
          ? undefined
          : data.splitAmounts
            ? data.splitAmounts.tarjeta
            : null,
      cashier:
        data.cashierId === undefined
          ? undefined
          : data.cashierId
            ? { connect: { id: data.cashierId } }
            : { disconnect: true },
      cashierName: data.cashierName === undefined ? undefined : data.cashierName,
      isSentToKitchen: data.isSentToKitchen,
    };

    if (data.linkedTables) {
      const uniqueLinkedTables = Array.from(new Set(data.linkedTables.filter(Boolean)));
      updateData.linkedTables = {
        deleteMany: {},
        create: uniqueLinkedTables.map((tableId) => ({ tableId })),
      };
    }

    if (data.items) {
      updateData.items = {
        deleteMany: {},
        create: data.items.map((i) => ({
          productId: i.productId,
          name: i.name,
          price: i.price,
          size: toDbSize(i.size),
          quantity: i.quantity,
          note: i.note,
          giftQuantity: i.giftQuantity,
          isSentToKitchen: i.isSentToKitchen ?? false,
          sentAt: i.sentAt ? new Date(i.sentAt) : undefined,
          kitchenStatus: i.kitchenStatus ? toDbKitchenStatus(i.kitchenStatus) : undefined,
          extras: {
            create: i.extras.map((e) => ({ name: e.name, price: e.price })),
          },
        })),
      };
    }

    const updated = await this.prisma.order.update({
      where: { id },
      data: updateData,
      include: {
        items: { include: { extras: true }, orderBy: { id: 'asc' } },
        linkedTables: { select: { tableId: true } },
      },
    });

    return this.mapOrder(updated);
  }

  async updateItemsKitchenStatus(params: {
    orderId: string;
    sentAt: Date;
    kitchenStatus: KitchenStatusDto;
  }): Promise<void> {
    await this.prisma.orderItem.updateMany({
      where: {
        orderId: params.orderId,
        isSentToKitchen: true,
        sentAt: params.sentAt,
      },
      data: {
        kitchenStatus: toDbKitchenStatus(params.kitchenStatus),
      },
    });
  }

  private mapOrder(o: {
    id: string;
    subTotal: Prisma.Decimal | null;
    taxAmount: Prisma.Decimal | null;
    total: Prisma.Decimal;
    status: import('@prisma/client').OrderStatus;
    timestamp: Date;
    customerName: string | null;
    customerAddress: string | null;
    orderType: import('@prisma/client').OrderType | null;
    tableId: string | null;
    paymentMethod: import('@prisma/client').PaymentMethod | null;
    splitEfectivo: Prisma.Decimal | null;
    splitTarjeta: Prisma.Decimal | null;
    cashierName: string | null;
    isSentToKitchen: boolean;
    linkedTables: Array<{ tableId: string }>;
    items: Array<{
      id: number;
      name: string;
      price: Prisma.Decimal;
      size: import('@prisma/client').ProductSize;
      quantity: number;
      note: string | null;
      giftQuantity: number | null;
      isSentToKitchen: boolean;
      sentAt: Date | null;
      kitchenStatus: KitchenStatus | null;
      extras: Array<{ id: number; name: string; price: Prisma.Decimal }>;
    }>;
  }): OrderEntity {
    const splitAmounts =
      o.splitEfectivo !== null && o.splitTarjeta !== null
        ? { efectivo: o.splitEfectivo.toNumber(), tarjeta: o.splitTarjeta.toNumber() }
        : undefined;

    return {
      id: o.id,
      items: o.items.map((i) => ({
        name: i.name,
        price: i.price.toNumber(),
        size: fromDbSize(i.size),
        quantity: i.quantity,
        extras: i.extras.map((e) => ({ name: e.name, price: e.price.toNumber() })),
        note: i.note ?? undefined,
        giftQuantity: i.giftQuantity ?? undefined,
        isSentToKitchen: i.isSentToKitchen,
        sentAt: i.sentAt ? i.sentAt.getTime() : undefined,
        kitchenStatus: i.kitchenStatus ? fromDbKitchenStatus(i.kitchenStatus) : undefined,
      })),
      subTotal: o.subTotal ? o.subTotal.toNumber() : undefined,
      taxAmount: o.taxAmount ? o.taxAmount.toNumber() : undefined,
      total: o.total.toNumber(),
      status: fromDbOrderStatus(o.status),
      timestamp: o.timestamp,
      customerName: o.customerName ?? undefined,
      customerAddress: o.customerAddress ?? undefined,
      orderType: o.orderType ? fromDbOrderType(o.orderType) : undefined,
      tableId: o.tableId ?? undefined,
      paymentMethod: o.paymentMethod ? fromDbPaymentMethod(o.paymentMethod) : undefined,
      splitAmounts,
      cashierName: o.cashierName ?? undefined,
      isSentToKitchen: o.isSentToKitchen,
      linkedTables: o.linkedTables.map((t) => t.tableId),
    };
  }
}
