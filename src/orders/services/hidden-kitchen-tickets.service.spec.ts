import { HiddenKitchenTicketsService } from './hidden-kitchen-tickets.service';
import type { PrismaService } from '../../prisma/prisma.service';

describe('HiddenKitchenTicketsService (F49)', () => {
  it('separa tickets ocultos de cocina de las órdenes ocultas del tablero', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([{ ticketId: 'ord-1-1700000000000' }])
      .mockResolvedValueOnce([{ ticketId: 'order:ord-2' }]);
    const orderFindMany = jest.fn().mockResolvedValue([{ id: 'ord-2' }]);
    const createMany = jest.fn().mockResolvedValue({ count: 1 });

    const service = new HiddenKitchenTicketsService({
      hiddenKitchenTicket: { findMany, createMany },
      order: { findMany: orderFindMany },
    } as unknown as PrismaService);

    const tickets = await service.listTicketIds();
    const orders = await service.listHiddenOrderIds();

    expect(tickets).toEqual(['ord-1-1700000000000']);
    expect(orders).toEqual(['ord-2']);
    expect(findMany).toHaveBeenNthCalledWith(1, {
      where: { NOT: { ticketId: { startsWith: 'order:' } } },
      select: { ticketId: true },
    });
    expect(findMany).toHaveBeenNthCalledWith(2, {
      where: { ticketId: { startsWith: 'order:' } },
      select: { ticketId: true },
    });

    await service.hideOrderIds(['ord-2', 'ord-inexistente'], 'caja1');
    expect(createMany).toHaveBeenCalledWith({
      data: [
        {
          ticketId: 'order:ord-2',
          hiddenBy: 'caja1',
          orderId: 'ord-2',
          sentAt: null,
        },
      ],
      skipDuplicates: true,
    });
  });
});
