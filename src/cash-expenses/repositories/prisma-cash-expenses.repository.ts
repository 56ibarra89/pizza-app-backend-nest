import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CashExpense,
  CashExpenseCategory,
  Prisma,
  ShiftStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateCashExpenseParams,
  ICashExpensesRepository,
  ListCashExpensesParams,
} from '../interfaces/cash-expenses.repository';
import { CashExpenseEntity } from '../entities/cash-expense.entity';
import { CashExpenseCategoryDto } from '../dto/cash-expense-category.dto';

@Injectable()
export class PrismaCashExpensesRepository implements ICashExpensesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateCashExpenseParams): Promise<CashExpenseEntity> {
    const executeCreate = async (tx: Prisma.TransactionClient) => {
      if (typeof tx.$queryRaw === 'function') {
        const lockedShifts = await tx.$queryRaw<
          Array<{ id: string; status: ShiftStatus }>
        >`
          SELECT id, status
          FROM "Shift"
          WHERE id = ${data.shiftId}
          FOR UPDATE
        `;
        const lockedShift = lockedShifts[0];
        if (!lockedShift) {
          throw new NotFoundException('Turno no encontrado');
        }
        if (lockedShift.status !== ShiftStatus.OPEN) {
          throw new BadRequestException(
            'Solo se pueden registrar gastos en un turno que esté actualmente abierto.',
          );
        }
      } else if (tx.shift?.findUnique) {
        const shift = await tx.shift.findUnique({
          where: { id: data.shiftId },
          select: { id: true, status: true },
        });
        if (!shift) {
          throw new NotFoundException('Turno no encontrado');
        }
        if (shift.status !== ShiftStatus.OPEN) {
          throw new BadRequestException(
            'Solo se pueden registrar gastos en un turno que esté actualmente abierto.',
          );
        }
      }

      if (
        typeof data.maxShiftTotalWithoutAuth === 'number' &&
        data.maxShiftTotalWithoutAuth > 0 &&
        !data.hasAuthorization &&
        tx.cashExpense?.aggregate
      ) {
        const aggregate = await tx.cashExpense.aggregate({
          where: { shiftId: data.shiftId },
          _sum: { amount: true },
        });
        const currentShiftTotal = aggregate._sum.amount?.toNumber() ?? 0;
        if (currentShiftTotal + data.amount > data.maxShiftTotalWithoutAuth) {
          throw new BadRequestException(
            'Este gasto requiere autorización con un PIN autorizado.',
          );
        }
      }

      const created = await tx.cashExpense.create({
        data: {
          shiftId: data.shiftId,
          amount: new Prisma.Decimal(data.amount),
          category: data.category,
          reason: data.reason,
          voucherNumber: data.voucherNumber?.trim() || null,
          notes: data.notes?.trim() || null,
          cashierId: data.cashierId ?? null,
          cashierSnapshotName: data.cashierSnapshotName,
        },
      });

      return this.map(created);
    };

    if (typeof this.prisma.$transaction === 'function') {
      return this.prisma.$transaction((tx) => executeCreate(tx));
    }
    return executeCreate(this.prisma);
  }

  async findById(id: string): Promise<CashExpenseEntity | null> {
    const row = await this.prisma.cashExpense.findUnique({
      where: { id },
    });
    return row ? this.map(row) : null;
  }

  async list(params: ListCashExpensesParams): Promise<CashExpenseEntity[]> {
    const rows = await this.prisma.cashExpense.findMany({
      where: {
        shiftId: params.shiftId,
        cashierId: params.cashierId,
        category: params.category
          ? (params.category as CashExpenseCategory)
          : undefined,
        createdAt: {
          gte: params.from,
          lte: params.to,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((r) => this.map(r));
  }

  async listByShiftId(shiftId: string): Promise<CashExpenseEntity[]> {
    const rows = await this.prisma.cashExpense.findMany({
      where: { shiftId },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((r) => this.map(r));
  }

  async getTotalExpensesByShiftId(shiftId: string): Promise<number> {
    const aggregate = await this.prisma.cashExpense.aggregate({
      where: { shiftId },
      _sum: {
        amount: true,
      },
    });

    return aggregate._sum.amount?.toNumber() ?? 0;
  }

  private map(row: CashExpense): CashExpenseEntity {
    return {
      id: row.id,
      shiftId: row.shiftId,
      amount: row.amount.toNumber(),
      category: row.category as unknown as CashExpenseCategoryDto,
      reason: row.reason,
      voucherNumber: row.voucherNumber ?? undefined,
      notes: row.notes ?? undefined,
      cashierId: row.cashierId ?? undefined,
      cashierSnapshotName: row.cashierSnapshotName,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
