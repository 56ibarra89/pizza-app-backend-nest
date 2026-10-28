import type { PrismaService } from '../../prisma/prisma.service';
import { HiddenKitchenTicketsService } from './hidden-kitchen-tickets.service';

describe('HiddenKitchenTicketsService', () => {
  const hiddenKitchenTicket = {
    findMany: jest.fn(),
    createMany: jest.fn(),
  };
  const order = { findMany: jest.fn() };
  const prisma = { hiddenKitchenTicket, order };
  const service = new HiddenKitchenTicketsService(
    prisma as unknown as PrismaService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    hiddenKitchenTicket.createMany.mockResolvedValue({ count: 1 });
  });

  it('links a hidden virtual ticket to its existing order and sent time', async () => {
    const sentAtMs = new Date('2026-10-27T14:30:00.000Z').getTime();
    order.findMany.mockResolvedValue([{ id: 'order-1' }]);

    await service.hide([`order-1-${sentAtMs}`], 'cocinero1');

    expect(order.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['order-1'] } },
      select: { id: true },
    });
    expect(hiddenKitchenTicket.createMany).toHaveBeenCalledWith({
      data: [
        {
          ticketId: `order-1-${sentAtMs}`,
          orderId: 'order-1',
          sentAt: new Date(sentAtMs),
          hiddenBy: 'cocinero1',
        },
      ],
      skipDuplicates: true,
    });
  });

  it('keeps malformed or orphan legacy ticket IDs without a foreign key', async () => {
    order.findMany.mockResolvedValue([]);

    await service.hide(['legacy-ticket'], 'admin');

    expect(order.findMany).not.toHaveBeenCalled();
    expect(hiddenKitchenTicket.createMany).toHaveBeenCalledWith({
      data: [
        {
          ticketId: 'legacy-ticket',
          orderId: null,
          sentAt: null,
          hiddenBy: 'admin',
        },
      ],
      skipDuplicates: true,
    });
  });
});
