import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { KitchenStatus, OrderStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  assertOrderTableDestinations,
  lockOrderTables,
  occupyOrderTables,
} from '../repositories/order-table-occupancy';

@Injectable()
export class OrderTableAssignmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async replace(
    orderId: string,
    tableIds?: readonly string[],
  ): Promise<string[]> {
    const uniqueTableIds = [...new Set((tableIds ?? []).filter(Boolean))];

    return this.prisma.$transaction(async (transaction) => {
      const rows = await transaction.$queryRaw<
        Array<{ status: string; parentOrderId?: string | null }>
      >`
        SELECT status, "parentOrderId" FROM "Order" WHERE id = ${orderId} FOR UPDATE
      `;
      if (!rows.length) throw new NotFoundException('Orden no encontrada');
      if (rows[0].status === OrderStatus.CANCELLED) {
        throw new BadRequestException(
          'No se pueden asignar mesas a una orden anulada',
        );
      }
      const rootOrderId = rows[0].parentOrderId || orderId;
      const activePaidChildren = await transaction.order.findMany({
        where: {
          parentOrderId: rootOrderId,
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
      const affectedOrderIds = Array.from(
        new Set([
          orderId,
          rootOrderId,
          ...activePaidChildren.map(({ id }) => id),
        ]),
      );

      const previousLinks =
        typeof transaction.orderTable?.findMany === 'function'
          ? await transaction.orderTable.findMany({
              where: { orderId: { in: affectedOrderIds } },
              select: { tableId: true },
            })
          : [];
      const previousTableIds = Array.from(
        new Set(previousLinks.map((link) => link.tableId)),
      );
      if (typeof transaction.mesa?.findMany === 'function') {
        await lockOrderTables(transaction, [...previousTableIds, ...uniqueTableIds]);
        await assertOrderTableDestinations(
          transaction,
          uniqueTableIds,
          new Set(previousTableIds),
          affectedOrderIds,
        );
      }

      await transaction.orderTable.deleteMany({
        where: { orderId: { in: affectedOrderIds } },
      });

      if (uniqueTableIds.length > 0) {
        await transaction.orderTable.createMany({
          data: affectedOrderIds.flatMap((affectedOrderId) =>
            uniqueTableIds.map((tableId) => ({
              orderId: affectedOrderId,
              tableId,
            })),
          ),
        });
      }

      if (typeof transaction.mesa?.updateMany === 'function') {
        await occupyOrderTables(transaction, uniqueTableIds);

        const releasedTableIds = previousTableIds.filter(
          (tableId) => !uniqueTableIds.includes(tableId),
        );
        if (releasedTableIds.length > 0) {
          const remainingActiveLinks =
            typeof transaction.orderTable?.findMany === 'function'
              ? await transaction.orderTable.findMany({
                  where: {
                    tableId: { in: releasedTableIds },
                    order: {
                      status: {
                        notIn: [OrderStatus.PAID, OrderStatus.CANCELLED],
                      },
                    },
                  },
                  select: { tableId: true },
                })
              : [];
          const stillOccupiedSet = new Set(
            remainingActiveLinks.map((link) => link.tableId),
          );
          const tablesToFree = releasedTableIds.filter(
            (tableId) => !stillOccupiedSet.has(tableId),
          );
          if (tablesToFree.length > 0) {
            await transaction.mesa.updateMany({
              where: {
                id: { in: tablesToFree },
                estado: 'OCUPADO',
              },
              data: { estado: 'DISPONIBLE' },
            });
          }
        }
      }

      if (typeof transaction.order.updateMany === 'function') {
        await transaction.order.updateMany({
          where: { id: { in: affectedOrderIds } },
          data: { updatedAt: new Date() },
        });
      }
      return affectedOrderIds;
    });
  }
}
