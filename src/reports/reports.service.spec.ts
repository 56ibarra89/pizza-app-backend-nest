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

  it('preserves topProducts and discounts from settled split aggregates without inflating order or payment counts', async () => {
    findMany.mockResolvedValue([
      {
        total: new Prisma.Decimal(0),
        discountAmount: new Prisma.Decimal(40),
        timestamp: new Date('2026-10-12T18:00:00.000Z'),
        paidAt: new Date('2026-10-12T18:30:00.000Z'),
        invoiceNumber: null,
        orderType: 'LOCAL',
        linkedTables: [{ tableId: 'F1-M1' }],
        payments: [],
        items: [
          {
            productId: 'pizza-1',
            name: 'Pizza Suprema',
            price: new Prisma.Decimal(100),
            quantity: 2,
            giftQuantity: 0,
            product: {
              categoryId: 'pizzas',
              category: { label: 'Pizzas' },
            },
          },
          {
            productId: null,
            name: 'Abono subcuenta (Persona 1)',
            price: new Prisma.Decimal(-80),
            quantity: 1,
            giftQuantity: 0,
            product: null,
          },
          {
            productId: null,
            name: 'Abono subcuenta (Persona 2)',
            price: new Prisma.Decimal(-80),
            quantity: 1,
            giftQuantity: 0,
            product: null,
          },
        ],
      },
      {
        total: new Prisma.Decimal(92),
        discountAmount: new Prisma.Decimal(0),
        timestamp: new Date('2026-10-12T18:20:00.000Z'),
        paidAt: new Date('2026-10-12T18:20:00.000Z'),
        invoiceNumber: 'OCT26-00001',
        orderType: 'LOCAL',
        linkedTables: [{ tableId: 'F1-M1' }],
        payments: [
          {
            method: 'TARJETA',
            amount: new Prisma.Decimal(92),
            methodConfigId: null,
            methodSnapshotName: 'POS Tarjeta',
            methodType: 'CARD_POS',
            currency: 'NIO',
            originalAmount: null,
          },
        ],
        items: [
          {
            productId: null,
            name: 'Pago parcial (Persona 1)',
            price: new Prisma.Decimal(80),
            quantity: 1,
            giftQuantity: 0,
            product: null,
          },
        ],
      },
      {
        total: new Prisma.Decimal(92),
        discountAmount: new Prisma.Decimal(0),
        timestamp: new Date('2026-10-12T18:30:00.000Z'),
        paidAt: new Date('2026-10-12T18:30:00.000Z'),
        invoiceNumber: 'OCT26-00002',
        orderType: 'LOCAL',
        linkedTables: [{ tableId: 'F1-M1' }],
        payments: [
          {
            method: 'TARJETA',
            amount: new Prisma.Decimal(92),
            methodConfigId: null,
            methodSnapshotName: 'POS Tarjeta',
            methodType: 'CARD_POS',
            currency: 'NIO',
            originalAmount: null,
          },
        ],
        items: [
          {
            productId: null,
            name: 'Pago parcial (Persona 2)',
            price: new Prisma.Decimal(80),
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

    expect(report).toMatchObject({
      totalSales: 184,
      cardSales: 184,
      cashSales: 0,
      totalOrders: 2,
      totalDiscounts: 40,
      discountedOrdersCount: 1,
    });
    expect(report.paymentBreakdown).toEqual([
      expect.objectContaining({
        type: 'CARD_POS',
        amount: 184,
        transactionCount: 2,
      }),
    ]);
    expect(report.topProducts).toEqual([
      {
        name: 'Pizza Suprema',
        quantity: 2,
        totalRevenue: 160,
        categoryId: 'pizzas',
        categoryName: 'Pizzas',
      },
    ]);
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
