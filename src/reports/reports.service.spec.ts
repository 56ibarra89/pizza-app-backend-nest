import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from './reports.service';

describe('ReportsService', () => {
  const findMany = jest.fn();
  const service = new ReportsService({
    order: { findMany },
  } as unknown as PrismaService);

  beforeEach(() => {
    findMany.mockReset();
  });

  it('aggregates paid-order data without returning raw orders', async () => {
    findMany.mockResolvedValue([
      {
        total: new Prisma.Decimal(90),
        discountAmount: new Prisma.Decimal(10),
        timestamp: new Date('2026-10-12T18:30:00.000Z'),
        orderType: 'DELIVERY',
        linkedTables: [],
        payments: [
          {
            method: 'EFECTIVO',
            amount: new Prisma.Decimal(90),
            methodConfigId: null,
            methodSnapshotName: null,
            methodType: null,
            currency: 'NIO',
            originalAmount: null,
          },
        ],
        items: [
          {
            productId: 'pizza-1',
            name: 'Pizza Suprema',
            price: new Prisma.Decimal(100),
            quantity: 1,
            giftQuantity: 0,
            product: {
              categoryId: 'pizzas',
              category: { label: 'Pizzas' },
            },
          },
          {
            productId: null,
            name: 'Delivery',
            price: new Prisma.Decimal(50),
            quantity: 1,
            giftQuantity: 0,
            product: null,
          },
        ],
      },
    ]);

    const report = await service.getSalesReport({
      startDate: new Date('2026-10-12T06:00:00.000Z'),
      endDate: new Date('2026-10-13T05:59:59.999Z'),
      timezoneOffsetMinutes: 360,
    });

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'PAID',
          paidAt: {
            gte: new Date('2026-10-12T06:00:00.000Z'),
            lte: new Date('2026-10-13T05:59:59.999Z'),
          },
        },
      }),
    );
    expect(report).toMatchObject({
      totalSales: 90,
      cashSales: 90,
      totalOrders: 1,
      totalDiscounts: 10,
      discountedOrdersCount: 1,
    });
    expect(report.channelsSummary[0]).toMatchObject({
      type: 'delivery',
      sales: 90,
      ordersCount: 1,
      percentage: 100,
    });
    expect(report.topProducts).toEqual([
      {
        name: 'Pizza Suprema',
        quantity: 1,
        totalRevenue: 90,
        categoryId: 'pizzas',
        categoryName: 'Pizzas',
      },
    ]);
    expect(report.salesByTime).toHaveLength(24);
    expect(report.salesByTime[12]).toEqual({
      time: '12:00',
      sales: 90,
      ordersCount: 1,
    });
  });

  it('rejects invalid or excessive ranges before querying the database', async () => {
    await expect(
      service.getSalesReport({
        startDate: new Date('2026-10-12T00:00:00.000Z'),
        endDate: new Date('2026-10-11T00:00:00.000Z'),
        timezoneOffsetMinutes: 360,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.getSalesReport({
        startDate: new Date('2025-01-01T00:00:00.000Z'),
        endDate: new Date('2026-10-12T00:00:00.000Z'),
        timezoneOffsetMinutes: 360,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(findMany).not.toHaveBeenCalled();
  });
});
