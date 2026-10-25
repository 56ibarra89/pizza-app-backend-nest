import { Injectable } from '@nestjs/common';
import { KitchenStatus, OrderStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class OrderTableAssignmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async replace(
    orderId: string,
    tableIds?: readonly string[],
  ): Promise<string[]> {
    const uniqueTableIds = [...new Set((tableIds ?? []).filter(Boolean))];

    return this.prisma.$transaction(async (transaction) => {
      const activePaidChildren = await transaction.order.findMany({
        where: {
          parentOrderId: orderId,
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
      const affectedOrderIds = [
        orderId,
        ...activePaidChildren.map(({ id }) => id),
      ];

      await transaction.orderTable.deleteMany({
        where: { orderId: { in: affectedOrderIds } },
      });

      if (uniqueTableIds.length === 0) return affectedOrderIds;

      await transaction.orderTable.createMany({
        data: affectedOrderIds.flatMap((affectedOrderId) =>
          uniqueTableIds.map((tableId) => ({
            orderId: affectedOrderId,
            tableId,
          })),
        ),
      });

      return affectedOrderIds;
    });
  }
}
