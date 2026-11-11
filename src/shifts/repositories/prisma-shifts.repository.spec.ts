import { BadRequestException } from '@nestjs/common';
import { LogLevel, PaymentMethod, Prisma, ShiftStatus } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { PrismaShiftsRepository } from './prisma-shifts.repository';
import { UserRoleDto } from '../../users/dto/user-role.dto';

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
      role: UserRoleDto;
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
    const orderFindMany = jest.fn(() => Promise.resolve([]));
    const tx = {
      shift: {
        findUnique: jest.fn(() => Promise.resolve(existingShift)),
        update: shiftUpdate,
      },
      payment: {
        groupBy: jest.fn(() =>
          Promise.resolve([
            {
              method: PaymentMethod.EFECTIVO,
              methodConfigId: null,
              methodSnapshotName: null,
              methodType: null,
              currency: 'NIO',
              _sum: {
                amount: new Prisma.Decimal(100),
                commissionAmount: null,
              },
              _count: { _all: 1 },
            },
          ]),
        ),
      },
      order: { findMany: orderFindMany },
      systemLog: { create: systemLogCreate },
    };
    const transaction = jest.fn(
      (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );
    const repository = new PrismaShiftsRepository(
      {
        $transaction: transaction,
      } as unknown as PrismaService,
      {
        findByPin: jest.fn(() => Promise.resolve(authorizer)),
      } as any,
    );

    return { repository, shiftUpdate, systemLogCreate, orderFindMany };
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

  it('lee ventas de un turno abierto sin consultar órdenes ni mesas para cierre', async () => {
    const orderFindMany = jest.fn();
    const paymentGroupBy = jest.fn().mockResolvedValue([]);
    const tx = {
      payment: { groupBy: paymentGroupBy },
      order: { findMany: orderFindMany },
    };
    const repository = new PrismaShiftsRepository(
      {
        shift: { findFirst: jest.fn().mockResolvedValue(existingShift) },
        $transaction: jest.fn(
          (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
        ),
      } as unknown as PrismaService,
      {} as any,
    );

    const active = await repository.findActive();

    expect(active?.totalSales).toBe(0);
    expect(paymentGroupBy).toHaveBeenCalledTimes(1);
    expect(orderFindMany).not.toHaveBeenCalled();
  });

  it('agrega pagos y comisiones en la base de datos al leer el turno', async () => {
    const paymentGroupBy = jest.fn().mockResolvedValue([
      {
        method: PaymentMethod.EFECTIVO,
        methodConfigId: null,
        methodSnapshotName: null,
        methodType: null,
        currency: 'NIO',
        _sum: { amount: new Prisma.Decimal(250), commissionAmount: null },
        _count: { _all: 2 },
      },
      {
        method: PaymentMethod.TARJETA,
        methodConfigId: 'card-1',
        methodSnapshotName: 'Tarjeta',
        methodType: 'TARJETA',
        currency: 'NIO',
        _sum: {
          amount: new Prisma.Decimal(100),
          commissionAmount: new Prisma.Decimal(3),
        },
        _count: { _all: 1 },
      },
    ]);
    const tx = { payment: { groupBy: paymentGroupBy } };
    const repository = new PrismaShiftsRepository(
      {
        shift: { findFirst: jest.fn().mockResolvedValue(existingShift) },
        $transaction: jest.fn(
          (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
        ),
      } as unknown as PrismaService,
      {} as any,
    );

    const active = await repository.findActive();

    expect(active).toMatchObject({
      cashSales: 250,
      cardSales: 100,
      totalSales: 350,
      totalPaymentCommission: 3,
      netSales: 347,
      expectedCash: 1250,
    });
    expect(active?.paymentBreakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          methodId: 'legacy-EFECTIVO',
          transactionCount: 2,
          grossAmount: 250,
        }),
        expect.objectContaining({
          methodId: 'card-1',
          transactionCount: 1,
          grossAmount: 100,
          commissionAmount: 3,
        }),
      ]),
    );
    expect(paymentGroupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { order: { shiftId: existingShift.id, status: 'PAID' } },
        _sum: { amount: true, commissionAmount: true },
      }),
    );
  });

  it('cierra directamente cuando el conteo es exacto', async () => {
    const { repository, systemLogCreate } = createHarness();

    const result = await repository.close({
      ...closeParams,
      closingAmount: 1100,
    });

    expect(result.cashDifference).toBe(0);
    const logged = systemLogCreate.mock.calls[0]?.[0];
    expect(logged?.data.action).toBe('SHIFT_CLOSED_HANDOVER');
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
        'El turno presenta un descuadre (Efectivo: C$ -0.01) y requiere autorización con PIN y justificación.',
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
        authorizationPin: '999999',
      }),
    ).rejects.toThrow(
      new BadRequestException(
        'El turno presenta un descuadre (Efectivo: C$ -1.00) y requiere autorización con PIN y justificación.',
      ),
    );
    expect(shiftUpdate).not.toHaveBeenCalled();
  });

  it('registra el cierre con descuadre y el supervisor que lo autorizó', async () => {
    const { repository, systemLogCreate } = createHarness({
      id: 'admin-1',
      username: 'supervisor',
      role: UserRoleDto.admin,
      isActive: true,
    });

    const result = await repository.close({
      ...closeParams,
      closingAmount: 1099,
      discrepancyReason: 'Faltante confirmado en conteo físico',
      authorizationPin: '123456',
    });

    expect(result.cashDifference).toBe(-1);
    expect(result.authorizedBySnapshotName).toBe('supervisor');
    const logged = systemLogCreate.mock.calls[0]?.[0];
    expect(logged?.data.action).toBe('SHIFT_CLOSED_HANDOVER_WITH_DISCREPANCY');
    expect(logged?.data.level).toBe(LogLevel.WARN);
  });

  it('revisa órdenes pendientes de cualquier turno en el cierre final', async () => {
    const { repository, orderFindMany } = createHarness();

    await repository.close({
      ...closeParams,
      closingAmount: 1100,
      closeType: 'END_OF_DAY',
    });

    expect(orderFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: { notIn: ['PAID', 'CANCELLED'] },
        },
      }),
    );
  });

  it('no consulta órdenes pendientes al cargar ventas en vivo de un turno abierto', async () => {
    const paymentGroupBy = jest.fn().mockResolvedValue([]);
    const orderFindMany = jest.fn().mockResolvedValue([]);
    const transaction = jest.fn((callback) =>
      callback({
        payment: { groupBy: paymentGroupBy },
        order: { findMany: orderFindMany },
      }),
    );
    const shiftFindFirst = jest.fn().mockResolvedValue(existingShift);
    const repository = new PrismaShiftsRepository(
      {
        shift: { findFirst: shiftFindFirst },
        $transaction: transaction,
      } as unknown as PrismaService,
      { findByPin: jest.fn() } as any,
    );

    await repository.findActive();

    expect(paymentGroupBy).toHaveBeenCalledTimes(1);
    expect(orderFindMany).not.toHaveBeenCalled();
  });
});
