import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CashExpense,
  LogLevel,
  MesaEstado,
  OrderStatus,
  PaymentMethod,
  Prisma,
  ShiftStatus,
  UserRole,
} from '@prisma/client';
import { CashExpenseCategoryDto } from '../../cash-expenses/dto/cash-expense-category.dto';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  CashDenominationCount,
  ShiftClosePreview,
  ShiftEntity,
} from '../entities/shift.entity';
import type { IShiftsRepository } from '../interfaces/shifts.repository';

type ShiftWithExpenses = Prisma.ShiftGetPayload<{
  include: { expenses: true };
}>;

const FINAL_ORDER_STATUSES = [OrderStatus.PAID, OrderStatus.CANCELLED];

@Injectable()
export class PrismaShiftsRepository implements IShiftsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findActive(): Promise<ShiftEntity | null> {
    const row = await this.prisma.shift.findFirst({
      where: { status: ShiftStatus.OPEN },
      include: { expenses: { orderBy: { createdAt: 'desc' } } },
      orderBy: { startTime: 'desc' },
    });
    return row ? this.map(row) : null;
  }

  async findActiveForCashier(params: {
    cashierId: string;
    cashierSnapshotName: string;
  }): Promise<ShiftEntity | null> {
    const row = await this.prisma.shift.findFirst({
      where: {
        status: ShiftStatus.OPEN,
        OR: [
          { cashierId: params.cashierId },
          {
            cashierId: null,
            cashierSnapshotName: params.cashierSnapshotName,
          },
        ],
      },
      include: { expenses: { orderBy: { createdAt: 'desc' } } },
      orderBy: { startTime: 'desc' },
    });
    return row ? this.map(row) : null;
  }

  async findById(id: string): Promise<ShiftEntity | null> {
    const row = await this.prisma.shift.findUnique({
      where: { id },
      include: { expenses: { orderBy: { createdAt: 'desc' } } },
    });
    return row ? this.map(row) : null;
  }

  async getClosePreview(params: {
    id: string;
    discrepancyThreshold: number;
  }): Promise<ShiftClosePreview> {
    return this.prisma.$transaction(async (tx) => {
      const shift = await tx.shift.findUnique({
        where: { id: params.id },
        include: { expenses: true },
      });
      if (!shift) throw new NotFoundException('Turno no encontrado');
      return this.buildClosePreview(tx, shift, params.discrepancyThreshold);
    });
  }

  async list(params: {
    limit: number;
    status?: ShiftStatus;
    from?: Date;
    to?: Date;
  }): Promise<ShiftEntity[]> {
    const rows = await this.prisma.shift.findMany({
      take: params.limit,
      include: { expenses: { orderBy: { createdAt: 'desc' } } },
      orderBy: { startTime: 'desc' },
      where: {
        status: params.status,
        startTime: { gte: params.from, lte: params.to },
      },
    });
    return rows.map((row) => this.map(row));
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
      include: { expenses: true },
    });
    return this.map(created);
  }

  async close(params: {
    id: string;
    endTime: Date;
    closingAmount: number;
    notes?: string;
    discrepancyReason?: string;
    authorizationPin?: string;
    denominationBreakdown?: CashDenominationCount[];
    discrepancyThreshold: number;
    actor: { id: string; username: string; role: string };
  }): Promise<ShiftEntity> {
    return this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.shift.findUnique({
          where: { id: params.id },
          include: { expenses: true },
        });
        if (!existing) throw new NotFoundException('Turno no encontrado');
        if (existing.status === ShiftStatus.CLOSED) {
          throw new BadRequestException('El turno ya está cerrado');
        }

        const preview = await this.buildClosePreview(
          tx,
          existing,
          params.discrepancyThreshold,
        );
        if (!preview.canClose) {
          throw new ConflictException({
            code: 'SHIFT_HAS_PENDING_OPERATIONS',
            message:
              'No se puede cerrar la caja mientras existan órdenes pendientes o mesas ocupadas sin cobrar.',
            blockingOrders: preview.blockingOrders,
            blockingTables: preview.blockingTables,
          });
        }

        this.assertDenominationTotal(
          params.closingAmount,
          params.denominationBreakdown,
        );

        const expectedCash = new Prisma.Decimal(preview.expectedCash);
        const cashDifference = new Prisma.Decimal(params.closingAmount).sub(
          expectedCash,
        );
        const requiresAuthorization = cashDifference
          .abs()
          .greaterThan(params.discrepancyThreshold);
        let authorizer:
          | { id: string; username: string; role: UserRole }
          | undefined;

        if (requiresAuthorization) {
          const reason = params.discrepancyReason?.trim();
          if (!reason) {
            throw new BadRequestException(
              'Debes justificar el descuadre antes de cerrar la caja.',
            );
          }
          if (!params.authorizationPin) {
            throw new ForbiddenException(
              'El descuadre requiere autorización con PIN de administrador o cajero principal.',
            );
          }

          const user = await tx.user.findUnique({
            where: { pin: params.authorizationPin },
            select: { id: true, username: true, role: true, isActive: true },
          });
          if (
            !user ||
            !user.isActive ||
            (user.role !== UserRole.ADMIN &&
              user.role !== UserRole.CAJERO_PRINCIPAL)
          ) {
            throw new ForbiddenException(
              'PIN inválido o el usuario no puede autorizar descuadres.',
            );
          }
          authorizer = user;
        }

        const updated = await tx.shift.update({
          where: { id: existing.id },
          data: {
            endTime: params.endTime,
            closingAmount: params.closingAmount,
            cashSales: preview.sales.cash,
            cardSales: preview.sales.card,
            appSales: preview.sales.app,
            totalSales: preview.sales.total,
            expectedCash,
            totalExpensesSnapshot: preview.totalExpenses,
            cashDifference,
            discrepancyReason: params.discrepancyReason?.trim() || null,
            authorizedById: authorizer?.id,
            authorizedBySnapshotName: authorizer?.username,
            authorizedByRole: authorizer?.role,
            denominationBreakdown: params.denominationBreakdown
              ? (params.denominationBreakdown as Prisma.InputJsonValue)
              : Prisma.JsonNull,
            status: ShiftStatus.CLOSED,
            notes: params.notes ?? existing.notes,
          },
          include: { expenses: { orderBy: { createdAt: 'desc' } } },
        });

        await tx.systemLog.create({
          data: {
            userId: params.actor.id,
            user: params.actor.username,
            role: params.actor.role,
            action: 'SHIFT_CLOSED',
            level: requiresAuthorization ? LogLevel.WARN : LogLevel.INFO,
            details: JSON.stringify({
              shiftId: existing.id,
              cashier: existing.cashierSnapshotName,
              openingAmount: existing.openingAmount.toNumber(),
              cashSales: preview.sales.cash,
              totalExpenses: preview.totalExpenses,
              expectedCash: preview.expectedCash,
              countedCash: params.closingAmount,
              difference: cashDifference.toNumber(),
              discrepancyThreshold: params.discrepancyThreshold,
              discrepancyReason: params.discrepancyReason?.trim() || null,
              authorizedBy: authorizer?.username ?? null,
            }),
          },
        });
        return this.map(updated);
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }

  private async buildClosePreview(
    tx: Prisma.TransactionClient,
    shift: ShiftWithExpenses,
    discrepancyThreshold: number,
  ): Promise<ShiftClosePreview> {
    const [payments, pendingOrders] = await Promise.all([
      tx.payment.findMany({
        where: { order: { shiftId: shift.id, status: OrderStatus.PAID } },
      }),
      tx.order.findMany({
        where: {
          shiftId: shift.id,
          status: { notIn: FINAL_ORDER_STATUSES },
        },
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          linkedTables: {
            select: {
              mesa: {
                select: { id: true, floor: true, number: true, estado: true },
              },
            },
          },
        },
        orderBy: { timestamp: 'asc' },
      }),
    ]);

    let cash = new Prisma.Decimal(0);
    let card = new Prisma.Decimal(0);
    let app = new Prisma.Decimal(0);
    let total = new Prisma.Decimal(0);
    for (const payment of payments) {
      total = total.add(payment.amount);
      if (payment.method === PaymentMethod.EFECTIVO)
        cash = cash.add(payment.amount);
      if (payment.method === PaymentMethod.TARJETA)
        card = card.add(payment.amount);
      if (payment.method === PaymentMethod.APP) app = app.add(payment.amount);
    }

    const totalExpenses = shift.expenses.reduce(
      (sum, expense) => sum.add(expense.amount),
      new Prisma.Decimal(0),
    );
    const expectedCash = shift.openingAmount.add(cash).sub(totalExpenses);
    const occupiedTables = new Map<
      string,
      { id: string; label: string; orderIds: Set<string> }
    >();
    const blockingOrders = pendingOrders.map((order) => {
      const tables = order.linkedTables.map(({ mesa }) => {
        const label = `Planta ${mesa.floor} - Mesa ${mesa.number}`;
        if (mesa.estado === MesaEstado.OCUPADO) {
          const current = occupiedTables.get(mesa.id) ?? {
            id: mesa.id,
            label,
            orderIds: new Set<string>(),
          };
          current.orderIds.add(order.id);
          occupiedTables.set(mesa.id, current);
        }
        return label;
      });
      return {
        id: order.id,
        invoiceNumber: order.invoiceNumber ?? undefined,
        status: order.status,
        tables,
      };
    });
    const expenses = shift.expenses.map((expense) => this.mapExpense(expense));
    const blockingTables = Array.from(occupiedTables.values()).map((table) => ({
      id: table.id,
      label: table.label,
      orderIds: Array.from(table.orderIds),
    }));

    return {
      shiftId: shift.id,
      openingAmount: shift.openingAmount.toNumber(),
      sales: {
        cash: cash.toNumber(),
        card: card.toNumber(),
        app: app.toNumber(),
        total: total.toNumber(),
      },
      expenses,
      totalExpenses: totalExpenses.toNumber(),
      expectedCash: expectedCash.toNumber(),
      discrepancyThreshold,
      blockingOrders,
      blockingTables,
      canClose: blockingOrders.length === 0 && blockingTables.length === 0,
    };
  }

  private assertDenominationTotal(
    closingAmount: number,
    breakdown?: CashDenominationCount[],
  ): void {
    if (!breakdown) return;
    const counted = breakdown.reduce(
      (sum, entry) => sum + entry.denomination * entry.quantity,
      0,
    );
    if (Math.round(counted * 100) !== Math.round(closingAmount * 100)) {
      throw new BadRequestException(
        'El total del desglose por denominaciones no coincide con el efectivo contado.',
      );
    }
  }

  private mapExpense(expense: CashExpense) {
    return {
      id: expense.id,
      shiftId: expense.shiftId,
      amount: expense.amount.toNumber(),
      category: expense.category as unknown as CashExpenseCategoryDto,
      reason: expense.reason,
      voucherNumber: expense.voucherNumber ?? undefined,
      notes: expense.notes ?? undefined,
      cashierId: expense.cashierId ?? undefined,
      cashierSnapshotName: expense.cashierSnapshotName,
      createdAt: expense.createdAt,
      updatedAt: expense.updatedAt,
    };
  }

  private map(row: ShiftWithExpenses): ShiftEntity {
    const expenses = row.expenses.map((expense) => this.mapExpense(expense));
    const currentExpenseTotal = expenses.reduce(
      (sum, expense) => sum + expense.amount,
      0,
    );
    const totalExpenses =
      row.totalExpensesSnapshot?.toNumber() ?? currentExpenseTotal;
    const expectedCash =
      row.expectedCash?.toNumber() ??
      row.openingAmount.toNumber() + row.cashSales.toNumber() - totalExpenses;
    const cashDifference =
      row.cashDifference?.toNumber() ??
      (row.closingAmount
        ? row.closingAmount.toNumber() - expectedCash
        : undefined);

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
      totalExpenses,
      expectedCash,
      totalExpensesSnapshot: row.totalExpensesSnapshot?.toNumber() ?? undefined,
      cashDifference,
      discrepancyReason: row.discrepancyReason ?? undefined,
      authorizedById: row.authorizedById ?? undefined,
      authorizedBySnapshotName: row.authorizedBySnapshotName ?? undefined,
      authorizedByRole: row.authorizedByRole ?? undefined,
      denominationBreakdown: this.mapDenominations(row.denominationBreakdown),
      status: row.status,
      notes: row.notes ?? undefined,
      expenses,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private mapDenominations(
    value: Prisma.JsonValue | null,
  ): CashDenominationCount[] | undefined {
    if (!Array.isArray(value)) return undefined;
    const entries: CashDenominationCount[] = [];
    for (const item of value) {
      if (
        typeof item === 'object' &&
        item !== null &&
        !Array.isArray(item) &&
        typeof item.denomination === 'number' &&
        typeof item.quantity === 'number'
      ) {
        entries.push({
          denomination: item.denomination,
          quantity: item.quantity,
        });
      }
    }
    return entries.length > 0 ? entries : undefined;
  }
}
