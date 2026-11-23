import { BadRequestException, ConflictException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';

export async function lockOrderTables(
  tx: Prisma.TransactionClient,
  tableIds: string[],
): Promise<void> {
  const ids = [...new Set(tableIds)].sort();
  if (!ids.length) return;
  await tx.$queryRaw`
    SELECT id FROM "Mesa" WHERE id IN (${Prisma.join(ids)})
    ORDER BY id FOR UPDATE
  `;
}

export async function assertOrderTableDestinations(
  tx: Prisma.TransactionClient,
  tableIds: string[],
  allowedReservedIds: ReadonlySet<string>,
  affectedOrderIds: string[] = [],
): Promise<void> {
  if (!tableIds.length) return;
  const mesas = await tx.mesa.findMany({
    where: { id: { in: tableIds }, isActive: true },
    select: { id: true, estado: true },
  });
  if (mesas.length !== tableIds.length) {
    throw new BadRequestException('Una o más mesas no existen o están deshabilitadas.');
  }
  if (mesas.some(({ id, estado }) => estado === 'RESERVADO' && !allowedReservedIds.has(id))) {
    throw new ConflictException('Una o más mesas de destino están reservadas.');
  }
  const conflict = await tx.orderTable.findFirst({
    where: {
      tableId: { in: tableIds },
      ...(affectedOrderIds.length && { orderId: { notIn: affectedOrderIds } }),
      order: { status: { notIn: [OrderStatus.PAID, OrderStatus.CANCELLED] } },
    },
    select: { tableId: true },
  });
  if (conflict) {
    throw new ConflictException('Una o más mesas de destino ya tienen otra cuenta activa.');
  }
}

export async function occupyOrderTables(
  tx: Prisma.TransactionClient,
  tableIds: string[],
): Promise<void> {
  if (!tableIds.length) return;
  await tx.mesa.updateMany({
    where: { id: { in: tableIds } },
    data: {
      estado: 'OCUPADO',
      reservationName: null,
      reservationAmount: null,
      reservationTime: null,
      expirationTime: null,
    },
  });
}
