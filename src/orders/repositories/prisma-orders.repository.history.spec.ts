import type { PrismaService } from '../../prisma/prisma.service';
import { PrismaOrdersRepository } from './prisma-orders.repository';

describe('PrismaOrdersRepository history pagination', () => {
  it('applies skip/take before loading order relations', async () => {
    let capturedQuery: unknown;
    const orderFindMany = jest.fn((args: unknown) => {
      capturedQuery = args;
      return Promise.resolve([]);
    });
    const orderCount = jest.fn().mockResolvedValue(42);
    const paymentFindMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      order: { findMany: orderFindMany, count: orderCount },
      payment: { findMany: paymentFindMany },
    } as unknown as PrismaService;
    const repository = new PrismaOrdersRepository(prisma);

    const result = await repository.listHistory({
      startDate: new Date('2026-10-01T00:00:00.000Z'),
      endDate: new Date('2026-10-12T23:59:59.999Z'),
      page: 2,
      pageSize: 25,
      view: 'invoices',
    });

    const query = capturedQuery as {
      skip: number;
      take: number;
      where?: {
        AND?: Array<{
          AND?: unknown[];
        }>;
      };
    };
    expect(query.skip).toBe(25);
    expect(query.take).toBe(25);
    expect(query.where?.AND?.[0]?.AND).toContainEqual({
      OR: [
        {
          paidAt: {
            gte: new Date('2026-10-01T00:00:00.000Z'),
            lte: new Date('2026-10-12T23:59:59.999Z'),
          },
        },
        {
          paidAt: null,
          timestamp: {
            gte: new Date('2026-10-01T00:00:00.000Z'),
            lte: new Date('2026-10-12T23:59:59.999Z'),
          },
        },
      ],
    });
    expect(query.where?.AND?.[0]?.AND).toContainEqual({
      NOT: {
        status: 'PAID',
        invoiceNumber: null,
        splitOrders: { some: {} },
      },
    });
    expect(result).toMatchObject({ items: [], total: 42 });
  });
});
