import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class OrderTableAssignmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async replace(orderId: string, tableIds?: readonly string[]): Promise<void> {
    const uniqueTableIds = [...new Set((tableIds ?? []).filter(Boolean))];

    await this.prisma.$transaction(async (transaction) => {
      await transaction.orderTable.deleteMany({
        where: { orderId },
      });

      if (uniqueTableIds.length === 0) return;

      await transaction.orderTable.createMany({
        data: uniqueTableIds.map((tableId) => ({
          orderId,
          tableId,
        })),
      });
    });
  }
}
