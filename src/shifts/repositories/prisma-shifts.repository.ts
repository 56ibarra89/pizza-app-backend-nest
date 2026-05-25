import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentMethod, Prisma, ShiftStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { IShiftsRepository } from '../interfaces/shifts.repository';
import type { ShiftEntity } from '../entities/shift.entity';

@Injectable()
export class PrismaShiftsRepository implements IShiftsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findActive(): Promise<ShiftEntity | null> {
    const row = await this.prisma.shift.findFirst({
      where: { status: ShiftStatus.OPEN },
      orderBy: { startTime: 'desc' },
    });
    return row ? this.map(row) : null;
  }

  async findById(id: string): Promise<ShiftEntity | null> {
    const row = await this.prisma.shift.findUnique({ where: { id } });
    return row ? this.map(row) : null;
  }

  async list(params: {
    limit: number;
    status?: ShiftStatus;
    from?: Date;
    to?: Date;
  }): Promise<ShiftEntity[]> {
    const rows = await this.prisma.shift.findMany({
      take: params.limit,
      orderBy: { startTime: 'desc' },
      where: {
        status: params.status,
        startTime: {
          gte: params.from,
          lte: params.to,
        },
      },
    });
    return rows.map((r) => this.map(r));
  }

  async open(params: {
    cashierId?: string;
    cashierSnapshotName: string;
    cashRegisterSnapshotName?: string;
    openingAmount: number;
    notes?: string;
    startTime: Date;
  }): Promise<ShiftEntity> {
    const created = await this.prisma.shift.create({
      data: {
        cashierId: params.cashierId,
        cashierSnapshotName: params.cashierSnapshotName,
        cashRegisterSnapshotName: params.cashRegisterSnapshotName,
        startTime: params.startTime,
        openingAmount: params.openingAmount,
        status: ShiftStatus.OPEN,
        notes: params.notes,
        cashSales: 0,
        cardSales: 0,
        appSales: 0,
        totalSales: 0,
      },
    });

    return this.map(created);
  }

  async close(params: {
    id: string;
    endTime: Date;
    closingAmount: number;
    notes?: string;
  }): Promise<ShiftEntity> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.shift.findUnique({ where: { id: params.id } });
      if (!existing) throw new NotFoundException('Turno no encontrado');
      if (existing.status === ShiftStatus.CLOSED) {
        throw new BadRequestException('El turno ya está cerrado');
      }

      const payments = await tx.payment.findMany({
        where: {
          order: {
            shiftId: existing.id,
            status: 'PAID',
          },
        },
      });

      let cash = new Prisma.Decimal(0);
      let card = new Prisma.Decimal(0);
      let app = new Prisma.Decimal(0);
      let total = new Prisma.Decimal(0);

      for (const p of payments) {
        total = total.add(p.amount);

        switch (p.method) {
          case PaymentMethod.EFECTIVO:
            cash = cash.add(p.amount);
            break;
          case PaymentMethod.TARJETA:
            card = card.add(p.amount);
            break;
          case PaymentMethod.APP:
            app = app.add(p.amount);
            break;
        }
      }

      const updated = await tx.shift.update({
        where: { id: existing.id },
        data: {
          endTime: params.endTime,
          closingAmount: params.closingAmount,
          cashSales: cash,
          cardSales: card,
          appSales: app,
          totalSales: total,
          status: ShiftStatus.CLOSED,
          notes: params.notes ?? existing.notes,
        },
      });

      return this.map(updated);
    });
  }

  private map(row: {
    id: string;
    cashierId: string | null;
    cashierSnapshotName: string;
    cashRegisterSnapshotName: string | null;
    startTime: Date;
    endTime: Date | null;
    openingAmount: Prisma.Decimal;
    closingAmount: Prisma.Decimal | null;
    cashSales: Prisma.Decimal;
    cardSales: Prisma.Decimal;
    appSales: Prisma.Decimal;
    totalSales: Prisma.Decimal;
    status: ShiftStatus;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): ShiftEntity {
    return {
      id: row.id,
      cashierId: row.cashierId ?? undefined,
      cashierSnapshotName: row.cashierSnapshotName,
      cashRegisterSnapshotName: row.cashRegisterSnapshotName ?? undefined,
      startTime: row.startTime,
      endTime: row.endTime ?? undefined,
      openingAmount: row.openingAmount.toNumber(),
      closingAmount: row.closingAmount?.toNumber() ?? undefined,
      cashSales: row.cashSales.toNumber(),
      cardSales: row.cardSales.toNumber(),
      appSales: row.appSales.toNumber(),
      totalSales: row.totalSales.toNumber(),
      status: row.status,
      notes: row.notes ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
