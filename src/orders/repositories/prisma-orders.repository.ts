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
        payments: true,
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
        payments: true,
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
        payments: true,
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
    discountAmount?: number;
    taxAmount?: number;
    total: number;
    status: import('../dto/order-status.dto').OrderStatusDto;
    timestamp: Date;
    customerSnapshotName?: string;
    customerAddress?: string;
    orderType?: import('../dto/order-type.dto').OrderTypeDto;
    cuponId?: number;
    payments?: { method: import('../dto/payment-method.dto').PaymentMethodDto; amount: number; cashierId?: string; cashierSnapshotName?: string }[];
    cashierId?: string;
    cashierSnapshotName?: string;
    isSentToKitchen?: boolean;
    linkedTables?: string[];
  }): Promise<OrderEntity> {
    const uniqueLinkedTables = Array.from(new Set((data.linkedTables ?? []).filter(Boolean)));

    const created = await this.prisma.order.create({
      data: {
        ...(data.id ? { id: data.id } : {}),
        shiftId: data.shiftId ?? null,
        customerId: data.customerId ?? null,
        subTotal: data.subTotal ?? null,
        discountAmount: data.discountAmount ?? null,
        taxAmount: data.taxAmount ?? null,
        total: data.total,
        status: toDbOrderStatus(data.status),
        timestamp: data.timestamp,

        customerSnapshotName: data.customerSnapshotName ?? null,
        customerAddress: data.customerAddress ?? null,
        orderType: data.orderType ? toDbOrderType(data.orderType) : undefined,
        cuponId: data.cuponId ?? null,
        ...(data.payments?.length
          ? {
            payments: {
                create: data.payments.map((p) => ({ method: toDbPaymentMethod(p.method), amount: p.amount, cashierId: p.cashierId, cashierSnapshotName: p.cashierSnapshotName })),
              },
            }
          : {}),
        cashierId: data.cashierId ?? null,
        cashierSnapshotName: data.cashierSnapshotName ?? null,
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
            giftQuantity: i.giftQuantity ?? 0,
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
        payments: true,
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
      discountAmount?: number | null;
      taxAmount?: number | null;
      total?: number;
      status?: import('../dto/order-status.dto').OrderStatusDto;
      shiftId?: string | null;
      customerId?: string | null;
      customerSnapshotName?: string | null;
      customerAddress?: string | null;
      orderType?: import('../dto/order-type.dto').OrderTypeDto | null;
      cuponId?: number | null;
      payments?: { method: import('../dto/payment-method.dto').PaymentMethodDto; amount: number; cashierId?: string; cashierSnapshotName?: string }[] | null;
      cashierId?: string | null;
      cashierSnapshotName?: string | null;
      cancelReason?: string | null;
      cancelledById?: string | null;
      cancelledAt?: Date | null;
      isSentToKitchen?: boolean;
      linkedTables?: string[];
    },
  ): Promise<OrderEntity> {
    const updateData: Prisma.OrderUpdateInput = {
      subTotal: data.subTotal === undefined ? undefined : data.subTotal,
      discountAmount: data.discountAmount === undefined ? undefined : data.discountAmount,
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
      customerSnapshotName: data.customerSnapshotName === undefined ? undefined : data.customerSnapshotName,
      customerAddress: data.customerAddress === undefined ? undefined : data.customerAddress,
      orderType:
        data.orderType === undefined
          ? undefined
          : data.orderType
            ? toDbOrderType(data.orderType)
            : null,
      cupon:
        data.cuponId === undefined
          ? undefined
          : data.cuponId
            ? { connect: { id: data.cuponId } }
            : { disconnect: true },
      cashier:
        data.cashierId === undefined
          ? undefined
          : data.cashierId
            ? { connect: { id: data.cashierId } }
            : { disconnect: true },
      cashierSnapshotName: data.cashierSnapshotName === undefined ? undefined : data.cashierSnapshotName,
      cancelReason: data.cancelReason === undefined ? undefined : data.cancelReason,
      cancelledBy:
        data.cancelledById === undefined
          ? undefined
          : data.cancelledById
            ? { connect: { id: data.cancelledById } }
            : { disconnect: true },
      cancelledAt: data.cancelledAt === undefined ? undefined : data.cancelledAt,
      isSentToKitchen: data.isSentToKitchen,
    };

    if (data.payments) {
      updateData.payments = {
        deleteMany: {},
        create: data.payments.map((p) => ({ method: toDbPaymentMethod(p.method), amount: p.amount, cashierId: p.cashierId, cashierSnapshotName: p.cashierSnapshotName })),
      };
    }

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
          giftQuantity: i.giftQuantity ?? 0,
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
        payments: true,
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
    discountAmount: Prisma.Decimal | null;
    taxAmount: Prisma.Decimal | null;
    total: Prisma.Decimal;
    status: import('@prisma/client').OrderStatus;
    timestamp: Date;
    invoiceCorrelativoId: string | null;
    invoiceDocumentType: import('@prisma/client').DocumentType | null;
    invoiceResolutionNumber: string | null;
    invoicePrefix: string | null;
    invoiceIssuedNumber: number | null;
    invoiceNumber: string | null;
    invoiceIssuedAt: Date | null;
    customerSnapshotName: string | null;
    customerAddress: string | null;
    orderType: import('@prisma/client').OrderType | null;
    cuponId: number | null;
    cashierSnapshotName: string | null;
    cancelReason: string | null;
    cancelledById: string | null;
    cancelledAt: Date | null;
    isSentToKitchen: boolean;
    linkedTables: Array<{ tableId: string }>;
    payments: Array<{
      id: number;
      method: import('@prisma/client').PaymentMethod;
      amount: Prisma.Decimal;
      reference: string | null;
      cashierId: string | null;
      cashierSnapshotName: string | null;
      createdAt: Date;
    }>;
    items: Array<{
      id: number;
      name: string;
      price: Prisma.Decimal;
      size: import('@prisma/client').ProductSize;
      quantity: number;
      note: string | null;
      giftQuantity: number;
      isSentToKitchen: boolean;
      sentAt: Date | null;
      kitchenStatus: KitchenStatus | null;
      extras: Array<{ id: number; name: string; price: Prisma.Decimal }>;
    }>;
  }): OrderEntity {
    return {
      id: o.id,
      payments: o.payments.map((p) => ({
        id: p.id,
        method: fromDbPaymentMethod(p.method),
        amount: p.amount.toNumber(),
        reference: p.reference ?? undefined,
        cashierId: p.cashierId ?? undefined,
        cashierSnapshotName: p.cashierSnapshotName ?? undefined,
        createdAt: p.createdAt,
      })),
      items: o.items.map((i) => ({
        name: i.name,
        price: i.price.toNumber(),
        size: fromDbSize(i.size),
        quantity: i.quantity,
        extras: i.extras.map((e) => ({ name: e.name, price: e.price.toNumber() })),
        note: i.note ?? undefined,
        giftQuantity: i.giftQuantity,
        isSentToKitchen: i.isSentToKitchen,
        sentAt: i.sentAt ? i.sentAt.getTime() : undefined,
        kitchenStatus: i.kitchenStatus ? fromDbKitchenStatus(i.kitchenStatus) : undefined,
      })),
      subTotal: o.subTotal ? o.subTotal.toNumber() : undefined,
      discountAmount: o.discountAmount ? o.discountAmount.toNumber() : undefined,
      taxAmount: o.taxAmount ? o.taxAmount.toNumber() : undefined,
      total: o.total.toNumber(),
      status: fromDbOrderStatus(o.status),
      timestamp: o.timestamp,
      customerSnapshotName: o.customerSnapshotName ?? undefined,
      customerAddress: o.customerAddress ?? undefined,
      orderType: o.orderType ? fromDbOrderType(o.orderType) : undefined,
      cuponId: o.cuponId ?? undefined,
      cashierSnapshotName: o.cashierSnapshotName ?? undefined,
      cancelReason: o.cancelReason ?? undefined,
      cancelledById: o.cancelledById ?? undefined,
      cancelledAt: o.cancelledAt ?? undefined,
      isSentToKitchen: o.isSentToKitchen,
      linkedTables: o.linkedTables.map((t) => t.tableId),
      invoice:
        o.invoiceCorrelativoId &&
        o.invoiceDocumentType &&
        o.invoiceResolutionNumber &&
        o.invoicePrefix !== null &&
        o.invoiceIssuedNumber !== null &&
        o.invoiceNumber &&
        o.invoiceIssuedAt
          ? {
              correlativoId: o.invoiceCorrelativoId,
              documentType: o.invoiceDocumentType,
              resolutionNumber: o.invoiceResolutionNumber,
              prefix: o.invoicePrefix,
              issuedNumber: o.invoiceIssuedNumber,
              invoiceNumber: o.invoiceNumber,
              issuedAt: o.invoiceIssuedAt,
            }
          : undefined,
    };
  }
}
