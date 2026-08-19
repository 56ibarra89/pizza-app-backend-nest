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
    list: jest.fn(),
    open: jest.fn(),
    close: jest.fn(),
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
    status: ShiftStatus.OPEN,
    createdAt: new Date('2026-08-18T08:00:00.000Z'),
    updatedAt: new Date('2026-08-18T08:00:00.000Z'),
  };

  let service: ShiftsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ShiftsService(repo);
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
});
