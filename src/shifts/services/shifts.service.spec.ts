import { ForbiddenException } from '@nestjs/common';
import { ShiftStatus } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { UserRoleDto } from '../../users/dto/user-role.dto';
import type { ShiftEntity } from '../entities/shift.entity';
import { ShiftsService } from './shifts.service';

describe('ShiftsService', () => {
  const repo = {
    findActive: jest.fn(),
    findActiveForCashier: jest.fn(),
    findById: jest.fn(),
    getClosePreview: jest.fn(),
    list: jest.fn(),
    open: jest.fn(),
    close: jest.fn(),
  };
  const appConfigService = {
    getByIdOrDefault: jest.fn(),
  };
  const user: AuthenticatedUser = {
    id: '2f2ec17b-c8e2-4108-a76c-b72be5f80437',
    username: 'principal',
    role: UserRoleDto.cajero_principal,
  };
  const activeShift: ShiftEntity = {
    id: 'shift-open',
    cashierId: user.id,
    cashierSnapshotName: user.username,
    cashRegisterSnapshotName: 'Caja Principal',
    startTime: new Date('2026-08-18T08:00:00.000Z'),
    openingAmount: 2000,
    cashSales: 0,
    cardSales: 0,
    appSales: 0,
    totalSales: 0,
    totalExpenses: 0,
    status: ShiftStatus.OPEN,
    createdAt: new Date('2026-08-18T08:00:00.000Z'),
    updatedAt: new Date('2026-08-18T08:00:00.000Z'),
  };

  let service: ShiftsService;

  beforeEach(() => {
    jest.clearAllMocks();
    appConfigService.getByIdOrDefault.mockResolvedValue({
      id: 'general_config',
      data: { cashDiscrepancyThreshold: 100 },
      updatedAt: new Date(0),
    });
    service = new ShiftsService(repo, appConfigService as never);
  });

  afterEach(() => jest.useRealTimers());

  it('registra el monto y la identidad autenticada al abrir la caja', async () => {
    const openingTime = new Date('2026-08-18T12:00:00.000Z');
    jest.useFakeTimers().setSystemTime(openingTime);
    repo.findActive.mockResolvedValue(null);
    repo.open.mockResolvedValue(activeShift);

    await service.open(
      {
        cashierName: 'usuario-manipulado',
        cashierId: '61ed84ec-04c7-49fa-9a07-e1f452ec4af4',
        openingAmount: 2000,
        cashRegisterName: 'Caja Principal',
      },
      user,
    );

    expect(repo.open).toHaveBeenCalledWith({
      cashierId: user.id,
      cashierSnapshotName: user.username,
      cashRegisterSnapshotName: 'Caja Principal',
      openingAmount: 2000,
      notes: undefined,
      startTime: openingTime,
    });
  });

  it('bloquea el cierre de sesión del cajero principal con caja abierta', async () => {
    repo.findActiveForCashier.mockResolvedValue(activeShift);

    await expect(service.assertCanTerminateSession(user)).rejects.toThrow(
      new ForbiddenException(
        'No puedes cerrar sesión porque tu caja está abierta. Debes cerrar la caja primero.',
      ),
    );
  });

  it('permite cerrar sesión cuando el cajero principal no tiene caja abierta', async () => {
    repo.findActiveForCashier.mockResolvedValue(null);

    await expect(
      service.assertCanTerminateSession(user),
    ).resolves.toBeUndefined();
  });

  it('obtiene la validación previa con el umbral configurado', async () => {
    repo.findById.mockResolvedValue(activeShift);
    repo.getClosePreview.mockResolvedValue({ canClose: true });

    await service.getClosePreview(activeShift.id, user);

    expect(repo.getClosePreview).toHaveBeenCalledWith({
      id: activeShift.id,
      discrepancyThreshold: 100,
    });
  });

  it('no expone los montos del arqueo ciego antes de confirmar el conteo', async () => {
    repo.findById.mockResolvedValue(activeShift);
    appConfigService.getByIdOrDefault.mockResolvedValue({
      id: 'general_config',
      data: { blindCashCount: true, cashDiscrepancyThreshold: 100 },
      updatedAt: new Date(0),
    });
    repo.getClosePreview.mockResolvedValue({
      shiftId: activeShift.id,
      openingAmount: 2000,
      sales: { cash: 500, card: 0, app: 0, total: 500 },
      expenses: [],
      totalExpenses: 0,
      expectedCash: 2500,
      discrepancyThreshold: 100,
      blockingOrders: [],
      blockingTables: [],
      canClose: true,
    });

    const hidden = await service.getClosePreview(activeShift.id, user);
    const revealed = await service.getClosePreview(activeShift.id, user, 2400);

    expect(hidden).toEqual(
      expect.objectContaining({ financialsRevealed: false, canClose: true }),
    );
    expect(hidden).not.toHaveProperty('expectedCash');
    expect(hidden).not.toHaveProperty('sales');
    expect(revealed).toEqual(
      expect.objectContaining({ financialsRevealed: true, expectedCash: 2500 }),
    );
  });

  it('envía los datos antifraude al cierre autoritativo', async () => {
    repo.findById.mockResolvedValue(activeShift);
    repo.close.mockResolvedValue({
      ...activeShift,
      status: ShiftStatus.CLOSED,
    });

    await service.close(
      activeShift.id,
      {
        closingAmount: 1800,
        discrepancyReason: 'Faltante validado por supervisión',
        authorizationPin: '1234',
        denominationBreakdown: [{ denomination: 500, quantity: 3 }],
      },
      user,
    );

    expect(repo.close).toHaveBeenCalledWith(
      expect.objectContaining({
        id: activeShift.id,
        closingAmount: 1800,
        discrepancyThreshold: 100,
        discrepancyReason: 'Faltante validado por supervisión',
        authorizationPin: '1234',
        actor: {
          id: user.id,
          username: user.username,
          role: user.role,
        },
      }),
    );
  });
});
