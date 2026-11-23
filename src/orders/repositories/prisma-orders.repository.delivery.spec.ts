import type { PrismaService } from '../../prisma/prisma.service';
import { PrismaOrdersRepository } from './prisma-orders.repository';

describe('PrismaOrdersRepository delivery payment day (RD-16)', () => {
  it('limits paid deliveries by paidAt and keeps old open deliveries operational', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = { order: { findMany } } as unknown as PrismaService;
    const repository = new PrismaOrdersRepository(prisma);
    const start = new Date('2026-11-21T06:00:00Z');
    const end = new Date('2026-11-22T05:59:59.999Z');
    const range = { gte: start, lte: end };
    const settled = {
      status: 'PAID',
      OR: [{ paidAt: range }, { paidAt: null, timestamp: range }],
    };
    const open = { status: { notIn: ['PAID', 'CANCELLED'] } };

    await repository.listTodayOrActive(start, { driverId: 'driver-1' });
    expect(findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: {
        orderType: 'DELIVERY',
        driverId: 'driver-1',
        OR: [open, settled],
      },
    }));

    const now = jest.spyOn(Date, 'now').mockReturnValue(start.getTime());
    try {
      await repository.listByDriverAndDate('driver-1', start, end);
    } finally {
      now.mockRestore();
    }
    expect(findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: {
        orderType: 'DELIVERY',
        driverId: 'driver-1',
        status: { not: 'CANCELLED' },
        OR: [
          settled,
          { status: { not: 'PAID' }, timestamp: range },
          open,
        ],
      },
    }));
  });
});
