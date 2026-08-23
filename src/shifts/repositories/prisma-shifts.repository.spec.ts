import { BadRequestException } from '@nestjs/common';
import {
  LogLevel,
  PaymentMethod,
  Prisma,
  ShiftStatus,
  UserRole,
} from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { PrismaShiftsRepository } from './prisma-shifts.repository';

describe('PrismaShiftsRepository.close', () => {
  const existingShift = {
    id: 'shift-1',
    cashierId: 'cashier-1',
    cashierSnapshotName: 'cajero',
    cashRegisterSnapshotName: 'Caja Principal',
    startTime: new Date('2026-08-22T08:00:00.000Z'),
    endTime: null,
    openingAmount: new Prisma.Decimal(1000),
    closingAmount: null,
    cashSales: new Prisma.Decimal(0),
    cardSales: new Prisma.Decimal(0),
    appSales: new Prisma.Decimal(0),
    totalSales: new Prisma.Decimal(0),
    expectedCash: null,
    totalExpensesSnapshot: null,
    cashDifference: null,
    discrepancyReason: null,
    authorizedById: null,
    authorizedBySnapshotName: null,
    authorizedByRole: null,
    denominationBreakdown: null,
    status: ShiftStatus.OPEN,
    notes: null,
    createdAt: new Date('2026-08-22T08:00:00.000Z'),
    updatedAt: new Date('2026-08-22T08:00:00.000Z'),
    expenses: [],
  };

  const createHarness = (
    authorizer: {
      id: string;
      username: string;
      role: UserRole;
      isActive: boolean;
    } | null = null,
  ) => {
    const shiftUpdate = jest.fn((input: { data: Record<string, unknown> }) =>
      Promise.resolve({
        ...existingShift,
        endTime: input.data.endTime as Date,
        closingAmount: new Prisma.Decimal(input.data.closingAmount as number),
        cashSales: new Prisma.Decimal(input.data.cashSales as number),
        cardSales: new Prisma.Decimal(input.data.cardSales as number),
        appSales: new Prisma.Decimal(input.data.appSales as number),
        totalSales: new Prisma.Decimal(input.data.totalSales as number),
        expectedCash: input.data.expectedCash as Prisma.Decimal,
        totalExpensesSnapshot: new Prisma.Decimal(
          input.data.totalExpensesSnapshot as number,
        ),
        cashDifference: input.data.cashDifference as Prisma.Decimal,
        discrepancyReason:
          (input.data.discrepancyReason as string | null) ?? null,
        authorizedById:
          (input.data.authorizedById as string | undefined) ?? null,
        authorizedBySnapshotName:
          (input.data.authorizedBySnapshotName as string | undefined) ?? null,
        authorizedByRole:
          (input.data.authorizedByRole as string | undefined) ?? null,
        denominationBreakdown: null,
        status: ShiftStatus.CLOSED,
        updatedAt: new Date('2026-08-22T18:00:00.000Z'),
      }),
    );
    const systemLogCreate = jest.fn(
      (input: { data: Record<string, unknown> }) => Promise.resolve(input),
    );
    const tx = {
      shift: {
        findUnique: jest.fn(() => Promise.resolve(existingShift)),
        update: shiftUpdate,
      },
      payment: {
        findMany: jest.fn(() =>
          Promise.resolve([
            {
              id: 1,
              orderId: 'order-paid',
              method: PaymentMethod.EFECTIVO,
              amount: new Prisma.Decimal(100),
              reference: null,
              cashierId: 'cashier-1',
              cashierSnapshotName: 'cajero',
              createdAt: new Date('2026-08-22T12:00:00.000Z'),
            },
          ]),
        ),
      },
      order: { findMany: jest.fn(() => Promise.resolve([])) },
      user: { findUnique: jest.fn(() => Promise.resolve(authorizer)) },
      systemLog: { create: systemLogCreate },
    };
    const transaction = jest.fn(
      (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );
    const repository = new PrismaShiftsRepository({
      $transaction: transaction,
    } as unknown as PrismaService);

    return { repository, shiftUpdate, systemLogCreate };
  };

  const closeParams = {
    id: existingShift.id,
    endTime: new Date('2026-08-22T18:00:00.000Z'),
    actor: {
      id: 'cashier-1',
      username: 'cajero',
      role: 'cajero_principal',
    },
  };

  it('cierra directamente cuando el conteo es exacto', async () => {
    const { repository, systemLogCreate } = createHarness();

    const result = await repository.close({
      ...closeParams,
      closingAmount: 1100,
    });

    expect(result.cashDifference).toBe(0);
    const logged = systemLogCreate.mock.calls[0]?.[0];
    expect(logged?.data.action).toBe('SHIFT_CLOSED');
    expect(logged?.data.level).toBe(LogLevel.INFO);
  });

  it('rechaza cualquier descuadre sin PIN y justificación válida', async () => {
    const { repository, shiftUpdate } = createHarness();

    await expect(
      repository.close({
        ...closeParams,
        closingAmount: 1099.99,
        discrepancyReason: 'No',
      }),
    ).rejects.toThrow(
      new BadRequestException(
        'El turno presenta un descuadre de C$ 0.01 y requiere autorización con PIN de Administrador y justificación.',
      ),
    );
    expect(shiftUpdate).not.toHaveBeenCalled();
  });

  it('rechaza el descuadre cuando el PIN no pertenece a un supervisor activo', async () => {
    const { repository, shiftUpdate } = createHarness(null);

    await expect(
      repository.close({
        ...closeParams,
        closingAmount: 1099,
        discrepancyReason: 'Faltante confirmado en conteo físico',
        authorizationPin: '9999',
      }),
    ).rejects.toThrow(
      new BadRequestException(
        'El turno presenta un descuadre de C$ 1.00 y requiere autorización con PIN de Administrador y justificación.',
      ),
    );
    expect(shiftUpdate).not.toHaveBeenCalled();
  });

  it('registra el cierre con descuadre y el supervisor que lo autorizó', async () => {
    const { repository, systemLogCreate } = createHarness({
      id: 'admin-1',
      username: 'supervisor',
      role: UserRole.ADMIN,
      isActive: true,
    });

    const result = await repository.close({
      ...closeParams,
      closingAmount: 1099,
      discrepancyReason: 'Faltante confirmado en conteo físico',
      authorizationPin: '1234',
    });

    expect(result.cashDifference).toBe(-1);
    expect(result.authorizedBySnapshotName).toBe('supervisor');
    const logged = systemLogCreate.mock.calls[0]?.[0];
    expect(logged?.data.action).toBe('SHIFT_CLOSED_WITH_DISCREPANCY');
    expect(logged?.data.level).toBe(LogLevel.WARN);
  });
});
