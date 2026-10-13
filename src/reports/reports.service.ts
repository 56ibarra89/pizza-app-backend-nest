import { BadRequestException, Injectable } from '@nestjs/common';
import type { OrderType, PaymentMethod } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  ChannelSalesSummaryDto,
  PaymentBreakdownRowDto,
  SalesByTimeDto,
  SalesReportDto,
  TopProductDto,
} from './dto/sales-report.dto';

const MAX_REPORT_RANGE_DAYS = 366;
const DAY_MS = 86_400_000;
const SPANISH_MONTHS = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sept',
  'oct',
  'nov',
  'dic',
] as const;

type ChannelType = ChannelSalesSummaryDto['type'];

const legacyPaymentType = (method: PaymentMethod): string => {
  if (method === 'EFECTIVO') return 'CASH';
  if (method === 'TARJETA') return 'CARD_POS';
  return 'BANK_TRANSFER';
};

const legacyPaymentName = (method: PaymentMethod): string => {
  if (method === 'EFECTIVO') return 'Efectivo';
  if (method === 'TARJETA') return 'POS Tarjeta';
  return 'App / Transferencia';
};

const isSupplementalItem = (name: string): boolean => {
  const normalized = name.trim().toLocaleLowerCase('es');
  return (
    normalized === 'delivery' ||
    normalized === 'empaque' ||
    normalized.startsWith('empaque ')
  );
};

const toChannelType = (
  orderType: OrderType | null,
  hasLinkedTable: boolean,
): ChannelType => {
  if (orderType === 'DELIVERY') return 'delivery';
  if (orderType === 'LOCAL') return 'local';
  if (orderType === 'LLEVAR') return 'llevar';
  return hasLinkedTable ? 'local' : 'llevar';
};

const shiftedDate = (date: Date, timezoneOffsetMinutes: number): Date =>
  new Date(date.getTime() - timezoneOffsetMinutes * 60_000);

const dayKey = (date: Date, timezoneOffsetMinutes: number): string => {
  const local = shiftedDate(date, timezoneOffsetMinutes);
  return `${String(local.getUTCDate()).padStart(2, '0')} ${SPANISH_MONTHS[local.getUTCMonth()]}`;
};

const hourKey = (date: Date, timezoneOffsetMinutes: number): string => {
  const local = shiftedDate(date, timezoneOffsetMinutes);
  return `${String(local.getUTCHours()).padStart(2, '0')}:00`;
};

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSalesReport(params: {
    startDate: Date;
    endDate: Date;
    timezoneOffsetMinutes: number;
  }): Promise<SalesReportDto> {
    this.validateRange(params.startDate, params.endDate);

    // Only report-relevant columns are loaded. Customer data, kitchen state,
    // extras and other large order relations never cross the database/API boundary.
    const orders = await this.prisma.order.findMany({
      where: {
        status: 'PAID',
        timestamp: { gte: params.startDate, lte: params.endDate },
      },
      select: {
        total: true,
        discountAmount: true,
        timestamp: true,
        orderType: true,
        linkedTables: { select: { tableId: true }, take: 1 },
        payments: {
          select: {
            method: true,
            amount: true,
            methodConfigId: true,
            methodSnapshotName: true,
            methodType: true,
            currency: true,
            originalAmount: true,
          },
        },
        items: {
          select: {
            productId: true,
            name: true,
            price: true,
            quantity: true,
            giftQuantity: true,
            product: {
              select: {
                categoryId: true,
                category: { select: { label: true } },
              },
            },
          },
        },
      },
    });

    let totalSales = 0;
    let cashSales = 0;
    let cardSales = 0;
    let appSales = 0;
    let totalDiscounts = 0;
    let discountedOrdersCount = 0;
    const products = new Map<string, TopProductDto>();
    const payments = new Map<string, PaymentBreakdownRowDto>();
    const times = new Map<string, { sales: number; ordersCount: number }>();
    const channels: Record<
      ChannelType,
      { sales: number; ordersCount: number }
    > = {
      delivery: { sales: 0, ordersCount: 0 },
      llevar: { sales: 0, ordersCount: 0 },
      local: { sales: 0, ordersCount: 0 },
    };

    const localStart = shiftedDate(
      params.startDate,
      params.timezoneOffsetMinutes,
    );
    const localEnd = shiftedDate(params.endDate, params.timezoneOffsetMinutes);
    const startDayUtc = Date.UTC(
      localStart.getUTCFullYear(),
      localStart.getUTCMonth(),
      localStart.getUTCDate(),
    );
    const endDayUtc = Date.UTC(
      localEnd.getUTCFullYear(),
      localEnd.getUTCMonth(),
      localEnd.getUTCDate(),
    );
    const groupByDay = Math.floor((endDayUtc - startDayUtc) / DAY_MS) >= 1;

    for (const order of orders) {
      const orderTotal = Number(order.total);
      const discount = Number(order.discountAmount ?? 0);
      totalSales += orderTotal;
      if (Number.isFinite(discount) && discount > 0) {
        totalDiscounts += discount;
        discountedOrdersCount += 1;
      }

      const channel = toChannelType(
        order.orderType,
        order.linkedTables.length > 0,
      );
      channels[channel].sales += orderTotal;
      channels[channel].ordersCount += 1;

      const time = groupByDay
        ? dayKey(order.timestamp, params.timezoneOffsetMinutes)
        : hourKey(order.timestamp, params.timezoneOffsetMinutes);
      const currentTime = times.get(time) ?? { sales: 0, ordersCount: 0 };
      times.set(time, {
        sales: currentTime.sales + orderTotal,
        ordersCount: currentTime.ordersCount + 1,
      });

      const orderPayments = order.payments.length
        ? order.payments
        : [
            {
              method: 'EFECTIVO' as const,
              amount: order.total,
              methodConfigId: null,
              methodSnapshotName: null,
              methodType: null,
              currency: null,
              originalAmount: null,
            },
          ];
      for (const payment of orderPayments) {
        const amount = Number(payment.amount);
        const type = payment.methodType || legacyPaymentType(payment.method);
        if (
          type === 'CASH' ||
          (!payment.methodType && payment.method === 'EFECTIVO')
        ) {
          cashSales += amount;
        } else if (
          type === 'CARD_POS' ||
          (!payment.methodType && payment.method === 'TARJETA')
        ) {
          cardSales += amount;
        } else {
          appSales += amount;
        }

        const id = payment.methodConfigId || `legacy:${payment.method}`;
        const row = payments.get(id) ?? {
          id,
          name:
            payment.methodSnapshotName?.trim() ||
            legacyPaymentName(payment.method),
          type,
          currency: payment.currency || 'NIO',
          amount: 0,
          transactionCount: 0,
        };
        row.amount += amount;
        row.transactionCount += 1;
        if (payment.originalAmount !== null) {
          row.originalAmount =
            (row.originalAmount ?? 0) + Number(payment.originalAmount);
        }
        payments.set(id, row);
      }

      const reportableItems = order.items.filter(
        (item) => item.productId && !isSupplementalItem(item.name),
      );
      const productGross = reportableItems.reduce(
        (sum, item) =>
          sum +
          Number(item.price) * Math.max(0, item.quantity - item.giftQuantity),
        0,
      );
      for (const item of reportableItems) {
        const categoryId = item.product?.categoryId;
        const categoryName = item.product?.category.label ?? 'Otros';
        const grossRevenue =
          Number(item.price) * Math.max(0, item.quantity - item.giftQuantity);
        const allocatedDiscount =
          productGross > 0 ? discount * (grossRevenue / productGross) : 0;
        const netRevenue = Math.max(0, grossRevenue - allocatedDiscount);
        const key = item.productId ?? `${categoryId ?? 'other'}:${item.name}`;
        const product = products.get(key);
        if (product) {
          product.quantity += item.quantity;
          product.totalRevenue += netRevenue;
        } else {
          products.set(key, {
            name: item.name,
            quantity: item.quantity,
            totalRevenue: netRevenue,
            categoryId,
            categoryName,
          });
        }
      }
    }

    const channelLabels: Record<ChannelType, string> = {
      delivery: 'Delivery',
      llevar: 'Para Llevar',
      local: 'Mesas / En Local',
    };
    const channelsSummary = (['delivery', 'llevar', 'local'] as const).map(
      (type) => ({
        type,
        label: channelLabels[type],
        sales: channels[type].sales,
        ordersCount: channels[type].ordersCount,
        percentage:
          totalSales > 0 ? (channels[type].sales / totalSales) * 100 : 0,
      }),
    );

    return {
      totalSales,
      cashSales,
      cardSales,
      appSales,
      paymentBreakdown: [...payments.values()].sort(
        (a, b) => b.amount - a.amount,
      ),
      totalOrders: orders.length,
      totalDiscounts,
      discountedOrdersCount,
      topProducts: [...products.values()].sort(
        (a, b) => b.quantity - a.quantity,
      ),
      salesByTime: this.buildTimeline(
        times,
        groupByDay,
        startDayUtc,
        endDayUtc,
      ),
      channelsSummary,
    };
  }

  private validateRange(startDate: Date, endDate: Date): void {
    if (
      Number.isNaN(startDate.getTime()) ||
      Number.isNaN(endDate.getTime()) ||
      endDate < startDate
    ) {
      throw new BadRequestException('El rango de fechas no es válido.');
    }
    if (
      endDate.getTime() - startDate.getTime() >
      MAX_REPORT_RANGE_DAYS * DAY_MS
    ) {
      throw new BadRequestException(
        `El rango máximo permitido es de ${MAX_REPORT_RANGE_DAYS} días.`,
      );
    }
  }

  private buildTimeline(
    times: Map<string, { sales: number; ordersCount: number }>,
    groupByDay: boolean,
    startDayUtc: number,
    endDayUtc: number,
  ): SalesByTimeDto[] {
    if (!groupByDay) {
      return Array.from({ length: 24 }, (_, hour) => {
        const time = `${String(hour).padStart(2, '0')}:00`;
        return { time, ...(times.get(time) ?? { sales: 0, ordersCount: 0 }) };
      });
    }

    const result: SalesByTimeDto[] = [];
    for (let cursor = startDayUtc; cursor <= endDayUtc; cursor += DAY_MS) {
      const date = new Date(cursor);
      const time = `${String(date.getUTCDate()).padStart(2, '0')} ${SPANISH_MONTHS[date.getUTCMonth()]}`;
      result.push({
        time,
        ...(times.get(time) ?? { sales: 0, ordersCount: 0 }),
      });
    }
    return result;
  }
}
