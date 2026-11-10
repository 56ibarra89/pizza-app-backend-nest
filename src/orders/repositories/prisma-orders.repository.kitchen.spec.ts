import { KitchenStatusDto } from '../dto/order-status.dto';
import type { PrismaService } from '../../prisma/prisma.service';
import { PrismaOrdersRepository } from './prisma-orders.repository';

describe('PrismaOrdersRepository kitchen status', () => {
  it('serializes combo selection updates and preserves selections from other kitchens', async () => {
    let comboUpdate: unknown;
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'order-1' }]),
      orderItem: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 45,
            isCombo: true,
            comboSelections: [
              { productId: 'a', kitchenId: 'kitchen-a', kitchenStatus: 'pending' },
              { productId: 'b', kitchenId: 'kitchen-b', kitchenStatus: 'ready' },
            ],
          },
        ]),
        updateMany: jest.fn(),
        update: jest.fn((args: unknown) => {
          comboUpdate = args;
          return Promise.resolve({});
        }),
      },
    };
    const prisma = {
      $transaction: jest.fn((fn: (client: typeof tx) => Promise<void>) => fn(tx)),
    } as unknown as PrismaService;
    const repository = new PrismaOrdersRepository(prisma);

    await repository.updateItemsKitchenStatus({
      orderId: 'order-1',
      sentAt: new Date('2026-11-10T12:00:00.000Z'),
      kitchenStatus: 'preparing' as KitchenStatusDto,
      kitchenId: 'kitchen-a',
      itemId: 45,
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(comboUpdate).toMatchObject({
      where: { id: 45 },
      data: {
        kitchenStatus: 'PREPARING',
        comboSelections: [
          { productId: 'a', kitchenId: 'kitchen-a', kitchenStatus: 'preparing' },
          { productId: 'b', kitchenId: 'kitchen-b', kitchenStatus: 'ready' },
        ],
      },
    });
  });
});
