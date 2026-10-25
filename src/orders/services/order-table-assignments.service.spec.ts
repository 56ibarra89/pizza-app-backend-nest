import { KitchenStatus, OrderStatus } from '@prisma/client';
import { OrderTableAssignmentsService } from './order-table-assignments.service';

describe('OrderTableAssignmentsService', () => {
  it('moves the parent and paid children that still have active kitchen items', async () => {
    const transaction = {
      order: {
        findMany: jest.fn().mockResolvedValue([{ id: 'paid-child' }]),
      },
      orderTable: {
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
        createMany: jest.fn().mockResolvedValue({ count: 4 }),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        <T>(callback: (tx: typeof transaction) => Promise<T>): Promise<T> =>
          callback(transaction),
      ),
    };
    const service = new OrderTableAssignmentsService(prisma as never);

    await expect(
      service.replace('parent-order', ['table-2', 'table-3']),
    ).resolves.toEqual(['parent-order', 'paid-child']);

    expect(transaction.order.findMany).toHaveBeenCalledWith({
      where: {
        parentOrderId: 'parent-order',
        status: OrderStatus.PAID,
        items: {
          some: {
            isSentToKitchen: true,
            OR: [
              { kitchenStatus: null },
              { kitchenStatus: { not: KitchenStatus.DELIVERED } },
            ],
          },
        },
      },
      select: { id: true },
    });
    expect(transaction.orderTable.deleteMany).toHaveBeenCalledWith({
      where: {
        orderId: { in: ['parent-order', 'paid-child'] },
      },
    });
    expect(transaction.orderTable.createMany).toHaveBeenCalledWith({
      data: [
        { orderId: 'parent-order', tableId: 'table-2' },
        { orderId: 'parent-order', tableId: 'table-3' },
        { orderId: 'paid-child', tableId: 'table-2' },
        { orderId: 'paid-child', tableId: 'table-3' },
      ],
    });
  });
});
