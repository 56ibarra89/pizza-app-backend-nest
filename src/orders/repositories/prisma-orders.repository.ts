import { Injectable } from '@nestjs/common';
import {
  PaymentMethod,
  Prisma,
  type KitchenStatus,
  type OrderStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { IOrdersRepository } from '../interfaces/orders.repository';
import type { OrderEntity } from '../entities/order.entity';
import type {
  CartItemEntity,
  SelectedComboOptionEntity,
} from '../entities/order-item.entity';
import { KitchenStatusDto } from '../dto/kitchen-status.dto';
import {
  fromDbKitchenStatus,
  fromDbOrderStatus,
  fromDbOrderType,
  fromDbPaymentMethod,
  toDbKitchenStatus,
  toDbOrderStatus,
  toDbOrderType,
  toDbPaymentMethod,
} from '../mappers/status.mapper';
import type { OrderHistoryPage } from '../interfaces/orders.repository';

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
          { paidAt: { gte: startOfDay } },
          { status: { notIn: ['PAID', 'CANCELLED'] satisfies OrderStatus[] } },
        ],
      },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        payments: true,
        items: {
          include: { extras: true, product: { select: { categoryId: true } } },
          orderBy: { id: 'asc' },
        },
        linkedTables: { select: { tableId: true } },
      },
      orderBy: { timestamp: 'desc' },
    });

    return orders.map((o) => this.mapOrder(o));
  }

  async listHistory(params: {
    startDate: Date;
    endDate: Date;
    page: number;
    pageSize: number;
    search?: string;
    paymentMethodId?: string;
    view?: 'all' | 'invoices';
    statuses?: import('../dto/order-status.dto').OrderStatusDto[];
  }): Promise<OrderHistoryPage> {
    const dateRange = { gte: params.startDate, lte: params.endDate };
    const baseConditions: Prisma.OrderWhereInput[] = [
      {
        OR: [{ paidAt: dateRange }, { paidAt: null, timestamp: dateRange }],
      },
    ];
    if (params.statuses?.length) {
      baseConditions.push({
        status: { in: params.statuses.map(toDbOrderStatus) },
      });
    }
    if (params.view === 'invoices') {
      baseConditions.push({
        OR: [
          { status: 'PAID' },
          { status: 'CANCELLED' },
          { status: 'DELIVERED', linkedTables: { none: {} } },
        ],
      });
    }
    if (params.search) {
      const tableSearch = params.search.replace(/^mesa\s+/i, '');
      baseConditions.push({
        OR: [
          { id: { contains: params.search, mode: 'insensitive' } },
          {
            invoiceNumber: {
              contains: params.search,
              mode: 'insensitive',
            },
          },
          {
            customerSnapshotName: {
              contains: params.search,
              mode: 'insensitive',
            },
          },
          {
            customer: {
              name: { contains: params.search, mode: 'insensitive' },
            },
          },
          {
            cashierSnapshotName: {
              contains: params.search,
              mode: 'insensitive',
            },
          },
          {
            linkedTables: {
              some: {
                tableId: { contains: tableSearch, mode: 'insensitive' },
              },
            },
          },
        ],
      });
    }
    const baseWhere: Prisma.OrderWhereInput = {
      AND: baseConditions,
    };

    let paymentWhere: Prisma.OrderWhereInput = {};
    if (params.paymentMethodId === 'MIXTO') {
      const mixedOrders = await this.prisma.$queryRaw<
        Array<{ orderId: string }>
      >(
        Prisma.sql`
          SELECT p."orderId"
          FROM "Payment" p
          INNER JOIN "Order" o ON o."id" = p."orderId"
          WHERE COALESCE(o."paidAt", o."timestamp") >= ${params.startDate}
            AND COALESCE(o."paidAt", o."timestamp") <= ${params.endDate}
          GROUP BY p."orderId"
          HAVING COUNT(*) > 1
        `,
      );
      paymentWhere = { id: { in: mixedOrders.map((row) => row.orderId) } };
    } else if (params.paymentMethodId?.startsWith('legacy:')) {
      const method = params.paymentMethodId.slice('legacy:'.length);
      if (Object.values(PaymentMethod).includes(method as PaymentMethod)) {
        paymentWhere = {
          OR: [
            { payments: { some: { method: method as PaymentMethod } } },
            ...(method === PaymentMethod.EFECTIVO
              ? [{ payments: { none: {} } }]
              : []),
          ],
        };
      } else {
        paymentWhere = { id: { in: [] } };
      }
    } else if (params.paymentMethodId) {
      paymentWhere = {
        payments: { some: { methodConfigId: params.paymentMethodId } },
      };
    }

    const where: Prisma.OrderWhereInput = {
      AND: [baseWhere, paymentWhere],
    };
    const [rows, total, paymentMethods, ordersWithoutPayments] =
      await Promise.all([
        this.prisma.order.findMany({
          where,
          skip: (params.page - 1) * params.pageSize,
          take: params.pageSize,
          include: {
            customer: { select: { id: true, name: true, phone: true } },
            payments: true,
            items: {
              include: {
                extras: true,
                product: { select: { categoryId: true } },
              },
              orderBy: { id: 'asc' },
            },
            linkedTables: { select: { tableId: true } },
          },
          orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
        }),
        this.prisma.order.count({ where }),
        this.prisma.payment.findMany({
          where: { order: baseWhere },
          select: {
            method: true,
            methodConfigId: true,
            methodSnapshotName: true,
          },
          distinct: ['methodConfigId', 'method'],
        }),
        this.prisma.order.count({
          where: { AND: [baseWhere, { payments: { none: {} } }] },
        }),
      ]);

    const paymentMethodOptions = new Map<string, string>();
    for (const payment of paymentMethods) {
      const id = payment.methodConfigId ?? `legacy:${payment.method}`;
      const fallbackName =
        payment.method === PaymentMethod.EFECTIVO
          ? 'Efectivo'
          : payment.method === PaymentMethod.TARJETA
            ? 'POS Tarjeta'
            : 'App / Transferencia';
      paymentMethodOptions.set(
        id,
        payment.methodSnapshotName?.trim() || fallbackName,
      );
    }
    if (ordersWithoutPayments > 0) {
      paymentMethodOptions.set('legacy:EFECTIVO', 'Efectivo');
    }

    return {
      items: rows.map((row) => this.mapOrder(row)),
      total,
      paymentMethodOptions: [...paymentMethodOptions.entries()]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  async listByDriverAndDate(
    driverId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<OrderEntity[]> {
    const includeActive = endDate.getTime() >= Date.now() - 60_000;
    const list = await this.prisma.order.findMany({
      where: {
        driverId,
        status: { not: 'CANCELLED' },
        OR: [
          { createdAt: { gte: startDate, lte: endDate } },
          { paidAt: { gte: startDate, lte: endDate } },
          ...(includeActive
            ? [
                {
                  status: {
                    notIn: ['PAID', 'CANCELLED'] satisfies OrderStatus[],
                  },
                },
              ]
            : []),
        ],
      },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        payments: true,
        items: {
          include: { extras: true, product: { select: { categoryId: true } } },
          orderBy: { id: 'asc' },
        },
        linkedTables: { select: { tableId: true } },
      },
      orderBy: { timestamp: 'desc' },
    });
    return list.map((o) => this.mapOrder(o));
  }

  async findById(id: string): Promise<OrderEntity | null> {
    const found = await this.prisma.order.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        payments: true,
        items: {
          include: { extras: true, product: { select: { categoryId: true } } },
          orderBy: { id: 'asc' },
        },
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
    discountId?: number;
    happyHourId?: number;
    payments?: {
      method: import('../dto/payment-method.dto').PaymentMethodDto;
      amount: number;
      reference?: string;
      methodConfigId?: string;
      methodSnapshotName?: string;
      methodType?: string;
      currency?: string;
      originalAmount?: number;
      exchangeRate?: number;
      commissionRate?: number;
      commissionAmount?: number;
      cashierId?: string;
      cashierSnapshotName?: string;
    }[];
    cashierId?: string;
    cashierSnapshotName?: string;
    driverId?: string;
    isSentToKitchen?: boolean;
    linkedTables?: string[];
    customerTendered?: number;
    deliveryChange?: number;
    certificateSerials?: string[];
  }): Promise<OrderEntity> {
    const uniqueLinkedTables = Array.from(
      new Set((data.linkedTables ?? []).filter(Boolean)),
    );

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
        discountId: data.discountId ?? null,
        happyHourId: data.happyHourId ?? null,
        customerTendered: data.customerTendered ?? null,
        deliveryChange: data.deliveryChange ?? null,
        pendingCertificateSerials: data.certificateSerials?.length
          ? (data.certificateSerials as Prisma.InputJsonValue)
          : undefined,
        ...(data.payments?.length
          ? {
              payments: {
                create: data.payments.map((p) => ({
                  method: toDbPaymentMethod(p.method),
                  amount: p.amount,
                  reference: p.reference,
                  methodConfigId: p.methodConfigId,
                  methodSnapshotName: p.methodSnapshotName,
                  methodType: p.methodType,
                  currency: p.currency,
                  originalAmount: p.originalAmount,
                  exchangeRate: p.exchangeRate,
                  commissionRate: p.commissionRate,
                  commissionAmount: p.commissionAmount,
                  cashierId: p.cashierId,
                  cashierSnapshotName: p.cashierSnapshotName,
                })),
              },
            }
          : {}),
        cashierId: data.cashierId ?? null,
        cashierSnapshotName: data.cashierSnapshotName ?? null,
        driverId: data.driverId ?? null,
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
            size: i.size,
            quantity: i.quantity,
            note: i.note,
            kitchenModifiers: i.kitchenModifiers
              ? (i.kitchenModifiers as unknown as Prisma.InputJsonValue)
              : undefined,
            giftQuantity: i.giftQuantity ?? 0,
            giftReason: i.giftReason,
            isSentToKitchen: i.isSentToKitchen ?? false,
            sentAt: i.sentAt ? new Date(i.sentAt) : undefined,
            kitchenStatus: i.kitchenStatus
              ? toDbKitchenStatus(i.kitchenStatus)
              : undefined,
            kitchenId: i.kitchenId,
            isCombo: i.isCombo ?? false,
            comboSelections: i.comboSelections
              ? (i.comboSelections as unknown as Prisma.InputJsonValue)
              : undefined,
            extras: {
              create: i.extras.map((e) => ({ name: e.name, price: e.price })),
            },
          })),
        },
      },
      include: {
        payments: true,
        items: {
          include: { extras: true, product: { select: { categoryId: true } } },
          orderBy: { id: 'asc' },
        },
        linkedTables: { select: { tableId: true } },
      },
    });

    return this.mapOrder(created);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.order.delete({ where: { id } });
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
      discountId?: number | null;
      happyHourId?: number | null;
      payments?:
        | {
            method: import('../dto/payment-method.dto').PaymentMethodDto;
            amount: number;
            reference?: string;
            methodConfigId?: string;
            methodSnapshotName?: string;
            methodType?: string;
            currency?: string;
            originalAmount?: number;
            exchangeRate?: number;
            commissionRate?: number;
            commissionAmount?: number;
            cashierId?: string;
            cashierSnapshotName?: string;
          }[]
        | null;
      cashierId?: string | null;
      cashierSnapshotName?: string | null;
      driverId?: string | null;
      cancelReason?: string | null;
      cancellationReasonId?: string | null;
      cancellationReasonLabel?: string | null;
      cancellationCategory?: string | null;
      cancellationCountsAsWaste?: boolean;
      cancellationWasPrepared?: boolean;
      cancellationRequiresSupervisor?: boolean;
      cancellationLossAmount?: number | null;
      cancelledById?: string | null;
      cancelledAt?: Date | null;
      isSentToKitchen?: boolean;
      linkedTables?: string[];
      customerTendered?: number | null;
      deliveryChange?: number | null;
      kitchenReadyAt?: Date | null;
      deliveryStartedAt?: Date | null;
      deliveredAt?: Date | null;
      deliverySlaAlertedAt?: Date | null;
      certificateSerials?: string[] | null;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<OrderEntity> {
    const updateData: Prisma.OrderUpdateInput = {
      subTotal: data.subTotal === undefined ? undefined : data.subTotal,
      discountAmount:
        data.discountAmount === undefined ? undefined : data.discountAmount,
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
      customerSnapshotName:
        data.customerSnapshotName === undefined
          ? undefined
          : data.customerSnapshotName,
      customerAddress:
        data.customerAddress === undefined ? undefined : data.customerAddress,
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
      discount:
        data.discountId === undefined
          ? undefined
          : data.discountId
            ? { connect: { id: data.discountId } }
            : { disconnect: true },
      happyHour:
        data.happyHourId === undefined
          ? undefined
          : data.happyHourId
            ? { connect: { id: data.happyHourId } }
            : { disconnect: true },
      cashier:
        data.cashierId === undefined
          ? undefined
          : data.cashierId
            ? { connect: { id: data.cashierId } }
            : { disconnect: true },
      driver:
        data.driverId === undefined
          ? undefined
          : data.driverId
            ? { connect: { id: data.driverId } }
            : { disconnect: true },
      cashierSnapshotName:
        data.cashierSnapshotName === undefined
          ? undefined
          : data.cashierSnapshotName,
      cancelReason:
        data.cancelReason === undefined ? undefined : data.cancelReason,
      cancellationReasonId:
        data.cancellationReasonId === undefined
          ? undefined
          : data.cancellationReasonId,
      cancellationReasonLabel:
        data.cancellationReasonLabel === undefined
          ? undefined
          : data.cancellationReasonLabel,
      cancellationCategory:
        data.cancellationCategory === undefined
          ? undefined
          : data.cancellationCategory,
      cancellationCountsAsWaste: data.cancellationCountsAsWaste,
      cancellationWasPrepared: data.cancellationWasPrepared,
      cancellationRequiresSupervisor: data.cancellationRequiresSupervisor,
      cancellationLossAmount:
        data.cancellationLossAmount === undefined
          ? undefined
          : data.cancellationLossAmount,
      cancelledBy:
        data.cancelledById === undefined
          ? undefined
          : data.cancelledById
            ? { connect: { id: data.cancelledById } }
            : { disconnect: true },
      cancelledAt:
        data.cancelledAt === undefined ? undefined : data.cancelledAt,
      isSentToKitchen: data.isSentToKitchen,
      customerTendered:
        data.customerTendered === undefined ? undefined : data.customerTendered,
      deliveryChange:
        data.deliveryChange === undefined ? undefined : data.deliveryChange,
      kitchenReadyAt:
        data.kitchenReadyAt === undefined ? undefined : data.kitchenReadyAt,
      deliveryStartedAt:
        data.deliveryStartedAt === undefined
          ? undefined
          : data.deliveryStartedAt,
      deliveredAt:
        data.deliveredAt === undefined ? undefined : data.deliveredAt,
      deliverySlaAlertedAt:
        data.deliverySlaAlertedAt === undefined
          ? undefined
          : data.deliverySlaAlertedAt,
      pendingCertificateSerials:
        data.certificateSerials === undefined
          ? undefined
          : data.certificateSerials && data.certificateSerials.length > 0
            ? data.certificateSerials
            : Prisma.DbNull,
    };

    if (data.payments) {
      updateData.payments = {
        deleteMany: {},
        create: data.payments.map((p) => ({
          method: toDbPaymentMethod(p.method),
          amount: p.amount,
          reference: p.reference,
          methodConfigId: p.methodConfigId,
          methodSnapshotName: p.methodSnapshotName,
          methodType: p.methodType,
          currency: p.currency,
          originalAmount: p.originalAmount,
          exchangeRate: p.exchangeRate,
          commissionRate: p.commissionRate,
          commissionAmount: p.commissionAmount,
          cashierId: p.cashierId,
          cashierSnapshotName: p.cashierSnapshotName,
        })),
      };
    }

    if (data.linkedTables) {
      const uniqueLinkedTables = Array.from(
        new Set(data.linkedTables.filter(Boolean)),
      );
      updateData.linkedTables = {
        deleteMany: {},
        create: uniqueLinkedTables.map((tableId) => ({ tableId })),
      };
    }

    if (data.items) {
      const existingItems = data.items.filter(
        (item): item is CartItemEntity & { id: number } =>
          item.id !== undefined,
      );
      const newItems = data.items.filter((item) => item.id === undefined);
      const itemData = (i: CartItemEntity) => ({
        productId: i.productId ?? null,
        name: i.name,
        price: i.price,
        size: i.size,
        quantity: i.quantity,
        note: i.note ?? null,
        kitchenModifiers: i.kitchenModifiers
          ? (i.kitchenModifiers as unknown as Prisma.InputJsonValue)
          : Prisma.DbNull,
        giftQuantity: i.giftQuantity ?? 0,
        giftReason: i.giftReason ?? null,
        isSentToKitchen: i.isSentToKitchen ?? false,
        sentAt: i.sentAt ? new Date(i.sentAt) : null,
        kitchenStatus: i.kitchenStatus
          ? toDbKitchenStatus(i.kitchenStatus)
          : null,
        kitchenId: i.kitchenId ?? null,
        isCombo: i.isCombo ?? false,
        comboSelections: i.comboSelections
          ? (i.comboSelections as unknown as Prisma.InputJsonValue)
          : Prisma.DbNull,
      });

      updateData.items = {
        deleteMany:
          existingItems.length > 0
            ? { id: { notIn: existingItems.map((item) => item.id) } }
            : {},
        update: existingItems.map((i) => ({
          where: { id: i.id },
          data: {
            ...itemData(i),
            extras: {
              deleteMany: {},
              create: i.extras.map((e) => ({ name: e.name, price: e.price })),
            },
          },
        })),
        create: newItems.map((i) => ({
          ...itemData(i),
          extras: {
            create: i.extras.map((e) => ({ name: e.name, price: e.price })),
          },
        })),
      };
    }

    const updated = await (tx ?? this.prisma).order.update({
      where: { id },
      data: updateData,
      include: {
        payments: true,
        items: {
          include: { extras: true, product: { select: { categoryId: true } } },
          orderBy: { id: 'asc' },
        },
        linkedTables: { select: { tableId: true } },
      },
    });

    return this.mapOrder(updated);
  }

  async updateItemsKitchenStatus(params: {
    orderId: string;
    sentAt: Date;
    kitchenStatus: KitchenStatusDto;
    kitchenId?: string;
    itemId?: number;
  }): Promise<void> {
    const whereClause: Prisma.OrderItemWhereInput = {
      orderId: params.orderId,
      isSentToKitchen: true,
    };

    if (params.itemId !== undefined) {
      whereClause.id = params.itemId;
    } else if (params.kitchenId) {
      whereClause.kitchenId = params.kitchenId;
    }

    const items = await this.prisma.orderItem.findMany({
      where: whereClause,
    });

    for (const item of items) {
      if (item.isCombo && Array.isArray(item.comboSelections)) {
        const selections =
          item.comboSelections as unknown as SelectedComboOptionEntity[];
        const updatedSelections = selections.map((sel) => {
          if (!params.kitchenId || sel.kitchenId === params.kitchenId) {
            return {
              ...sel,
              kitchenStatus: params.kitchenStatus,
            };
          }
          return sel;
        });

        const allDelivered = updatedSelections.every(
          (s) => s.kitchenStatus === KitchenStatusDto.delivered,
        );
        const allReadyOrDelivered = updatedSelections.every(
          (s) =>
            s.kitchenStatus === KitchenStatusDto.ready ||
            s.kitchenStatus === KitchenStatusDto.delivered,
        );
        const anyPreparingOrReady = updatedSelections.some(
          (s) =>
            s.kitchenStatus === KitchenStatusDto.preparing ||
            s.kitchenStatus === KitchenStatusDto.ready,
        );

        let overallStatus: KitchenStatusDto = 'pending' as KitchenStatusDto;
        if (allDelivered) overallStatus = 'delivered' as KitchenStatusDto;
        else if (allReadyOrDelivered)
          overallStatus = 'ready' as KitchenStatusDto;
        else if (anyPreparingOrReady)
          overallStatus = 'preparing' as KitchenStatusDto;

        await this.prisma.orderItem.update({
          where: { id: item.id },
          data: {
            kitchenStatus: toDbKitchenStatus(overallStatus),
            comboSelections:
              updatedSelections as unknown as Prisma.InputJsonValue,
          },
        });
      } else {
        await this.prisma.orderItem.update({
          where: { id: item.id },
          data: {
            kitchenStatus: toDbKitchenStatus(params.kitchenStatus),
          },
        });
      }
    }
  }

  private mapOrder(o: {
    id: string;
    subTotal: Prisma.Decimal | null;
    discountAmount: Prisma.Decimal | null;
    taxAmount: Prisma.Decimal | null;
    total: Prisma.Decimal;
    status: import('@prisma/client').OrderStatus;
    timestamp: Date;
    paidAt: Date | null;
    pendingCertificateSerials: Prisma.JsonValue | null;
    invoiceCorrelativoId: string | null;
    invoiceDocumentType: import('@prisma/client').DocumentType | null;
    invoiceResolutionNumber: string | null;
    invoicePrefix: string | null;
    invoiceIssuedNumber: number | null;
    invoiceNumber: string | null;
    invoiceIssuedAt: Date | null;
    customerSnapshotName: string | null;
    customerId?: string | null;
    customer?: { id: string; name: string; phone: string | null } | null;
    customerAddress: string | null;
    orderType: import('@prisma/client').OrderType | null;
    driverId: string | null;
    cuponId: number | null;
    discountId: number | null;
    happyHourId: number | null;
    cashierSnapshotName: string | null;
    cancelReason: string | null;
    cancellationReasonId: string | null;
    cancellationReasonLabel: string | null;
    cancellationCategory: string | null;
    cancellationCountsAsWaste: boolean;
    cancellationWasPrepared: boolean;
    cancellationRequiresSupervisor: boolean;
    cancellationLossAmount: Prisma.Decimal | null;
    cancelledById: string | null;
    cancelledAt: Date | null;
    isSentToKitchen: boolean;
    linkedTables: Array<{ tableId: string }>;
    payments: Array<{
      id: number;
      method: import('@prisma/client').PaymentMethod;
      amount: Prisma.Decimal;
      reference: string | null;
      methodConfigId: string | null;
      methodSnapshotName: string | null;
      methodType: string | null;
      currency: string | null;
      originalAmount: Prisma.Decimal | null;
      exchangeRate: Prisma.Decimal | null;
      commissionRate: Prisma.Decimal | null;
      commissionAmount: Prisma.Decimal | null;
      cashierId: string | null;
      cashierSnapshotName: string | null;
      createdAt: Date;
    }>;
    items: Array<{
      id: number;
      productId: string | null;
      name: string;
      price: Prisma.Decimal;
      size: string;
      quantity: number;
      note: string | null;
      kitchenModifiers: Prisma.JsonValue | null;
      giftQuantity: number;
      giftReason: string | null;
      isSentToKitchen: boolean;
      sentAt: Date | null;
      kitchenStatus: KitchenStatus | null;
      kitchenId: string | null;
      isCombo?: boolean | null;
      comboSelections?: any;
      product: { categoryId: string } | null;
      extras: Array<{ id: number; name: string; price: Prisma.Decimal }>;
    }>;
    customerTendered: Prisma.Decimal | null;
    deliveryChange: Prisma.Decimal | null;
    kitchenReadyAt: Date | null;
    deliveryStartedAt: Date | null;
    deliveredAt: Date | null;
    deliverySlaAlertedAt: Date | null;
  }): OrderEntity {
    return {
      id: o.id,
      payments: o.payments.map((p) => ({
        id: p.id,
        method: fromDbPaymentMethod(p.method),
        amount: p.amount.toNumber(),
        reference: p.reference ?? undefined,
        methodConfigId: p.methodConfigId ?? undefined,
        methodSnapshotName: p.methodSnapshotName ?? undefined,
        methodType: p.methodType ?? undefined,
        currency: p.currency ?? undefined,
        originalAmount: p.originalAmount?.toNumber(),
        exchangeRate: p.exchangeRate?.toNumber(),
        commissionRate: p.commissionRate?.toNumber(),
        commissionAmount: p.commissionAmount?.toNumber(),
        cashierId: p.cashierId ?? undefined,
        cashierSnapshotName: p.cashierSnapshotName ?? undefined,
        createdAt: p.createdAt,
      })),
      items: o.items.map((i) => ({
        id: i.id,
        productId: i.productId ?? undefined,
        categoryId: i.product?.categoryId,
        name: i.name,
        price: i.price.toNumber(),
        size: i.size,
        quantity: i.quantity,
        extras: i.extras.map((e) => ({
          name: e.name,
          price: e.price.toNumber(),
        })),
        note: i.note ?? undefined,
        kitchenModifiers: Array.isArray(i.kitchenModifiers)
          ? (i.kitchenModifiers as unknown as CartItemEntity['kitchenModifiers'])
          : undefined,
        giftQuantity: i.giftQuantity,
        giftReason: i.giftReason ?? undefined,
        isSentToKitchen: i.isSentToKitchen,
        sentAt: i.sentAt ? i.sentAt.getTime() : undefined,
        kitchenStatus: i.kitchenStatus
          ? fromDbKitchenStatus(i.kitchenStatus)
          : undefined,
        kitchenId: i.kitchenId ?? undefined,
        isCombo: Boolean(i.isCombo),
        comboSelections: Array.isArray(i.comboSelections)
          ? (i.comboSelections as unknown as SelectedComboOptionEntity[])
          : undefined,
      })),
      subTotal: o.subTotal ? o.subTotal.toNumber() : undefined,
      discountAmount: o.discountAmount
        ? o.discountAmount.toNumber()
        : undefined,
      taxAmount: o.taxAmount ? o.taxAmount.toNumber() : undefined,
      total: o.total.toNumber(),
      status: fromDbOrderStatus(o.status),
      timestamp: o.timestamp,
      paidAt: o.paidAt ?? undefined,
      customerId: o.customerId ?? o.customer?.id ?? undefined,
      customerSnapshotName:
        o.customerSnapshotName ?? o.customer?.name ?? undefined,
      customerPhone: o.customer?.phone ?? undefined,
      customerAddress: o.customerAddress ?? undefined,
      orderType: o.orderType ? fromDbOrderType(o.orderType) : undefined,
      driverId: o.driverId ?? undefined,
      cuponId: o.cuponId ?? undefined,
      discountId: o.discountId ?? undefined,
      happyHourId: o.happyHourId ?? undefined,
      certificateSerials: Array.isArray(o.pendingCertificateSerials)
        ? o.pendingCertificateSerials.filter(
            (serial): serial is string => typeof serial === 'string',
          )
        : undefined,
      cashierSnapshotName: o.cashierSnapshotName ?? undefined,
      cancelReason: o.cancelReason ?? undefined,
      cancellationReasonId: o.cancellationReasonId ?? undefined,
      cancellationReasonLabel: o.cancellationReasonLabel ?? undefined,
      cancellationCategory: o.cancellationCategory ?? undefined,
      cancellationCountsAsWaste: o.cancellationCountsAsWaste,
      cancellationWasPrepared: o.cancellationWasPrepared,
      cancellationRequiresSupervisor: o.cancellationRequiresSupervisor,
      cancellationLossAmount: o.cancellationLossAmount?.toNumber() ?? undefined,
      cancelledById: o.cancelledById ?? undefined,
      cancelledAt: o.cancelledAt ?? undefined,
      isSentToKitchen: o.isSentToKitchen,
      linkedTables: o.linkedTables.map((t) => t.tableId),
      customerTendered: o.customerTendered
        ? o.customerTendered.toNumber()
        : undefined,
      deliveryChange: o.deliveryChange
        ? o.deliveryChange.toNumber()
        : undefined,
      kitchenReadyAt: o.kitchenReadyAt ?? undefined,
      deliveryStartedAt: o.deliveryStartedAt ?? undefined,
      deliveredAt: o.deliveredAt ?? undefined,
      deliverySlaAlertedAt: o.deliverySlaAlertedAt ?? undefined,
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
