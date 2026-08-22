import { Injectable } from '@nestjs/common';
import { CashExpense, CashExpenseCategory, Prisma } from '@prisma/client';
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
    const created = await this.prisma.cashExpense.create({
      data: {
        shiftId: data.shiftId,
        amount: new Prisma.Decimal(data.amount),
        category: data.category as CashExpenseCategory,
        reason: data.reason,
        voucherNumber: data.voucherNumber?.trim() || null,
        notes: data.notes?.trim() || null,
        cashierId: data.cashierId ?? null,
        cashierSnapshotName: data.cashierSnapshotName,
      },
    });

    return this.map(created);
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
        category: params.category ? (params.category as CashExpenseCategory) : undefined,
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
