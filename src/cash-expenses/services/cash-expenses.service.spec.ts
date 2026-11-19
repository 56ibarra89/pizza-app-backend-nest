import { BadRequestException } from '@nestjs/common';
import { ShiftStatus } from '@prisma/client';
import { CashExpensesService } from './cash-expenses.service';
import { CashExpenseCategoryDto } from '../dto/cash-expense-category.dto';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { UserRoleDto } from '../../users/dto/user-role.dto';

describe('CashExpensesService', () => {
  const repo = {
    create: jest.fn(),
    findById: jest.fn(),
    list: jest.fn(),
    listByShiftId: jest.fn(),
    getTotalExpensesByShiftId: jest.fn(),
  };

  const shiftsService = {
    getActive: jest.fn(),
    getById: jest.fn(),
    getActiveSummary: jest.fn(),
    getSummaryById: jest.fn(),
  };

  const configService = {
    getByIdOrDefault: jest.fn(),
  };

  const usersRepository = {
    findByPin: jest.fn(),
  };

  const user: AuthenticatedUser = {
    id: 'user-cajero-1',
    username: 'cajero1',
    role: UserRoleDto.cajero,
  };

  let service: CashExpensesService;

  beforeEach(() => {
    jest.clearAllMocks();
    configService.getByIdOrDefault.mockResolvedValue({
      id: 'petty_cash_policy',
      data: {
        maxAmountWithoutAuth: 500,
        maxShiftTotal: 2000,
        requireVoucherOver: 0,
        requireVoucherAlways: false,
        categoryPolicies: {},
      },
    });
    repo.getTotalExpensesByShiftId.mockResolvedValue(0);
    service = new CashExpensesService(
      repo,
      shiftsService as any,
      configService as any,
      usersRepository as any,
    );
  });

  it('registra un gasto exitosamente en el turno activo', async () => {
    shiftsService.getActiveSummary.mockResolvedValue({
      id: 'shift-123',
      status: ShiftStatus.OPEN,
    });
    shiftsService.getSummaryById.mockResolvedValue({
      id: 'shift-123',
      status: ShiftStatus.OPEN,
    });
    repo.create.mockResolvedValue({
      id: 'expense-1',
      shiftId: 'shift-123',
      amount: 350,
      category: CashExpenseCategoryDto.SERVICIOS_BASICOS,
      reason: 'Pago de energía eléctrica',
      cashierId: user.id,
      cashierSnapshotName: user.username,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await service.create(
      {
        amount: 350,
        category: CashExpenseCategoryDto.SERVICIOS_BASICOS,
        reason: 'Pago de energía eléctrica',
      },
      user,
    );

    expect(shiftsService.getActiveSummary).toHaveBeenCalled();
    expect(shiftsService.getSummaryById).not.toHaveBeenCalled();
    expect(shiftsService.getActive).not.toHaveBeenCalled();
    expect(shiftsService.getById).not.toHaveBeenCalled();
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        shiftId: 'shift-123',
        amount: 350,
        category: CashExpenseCategoryDto.SERVICIOS_BASICOS,
        reason: 'Pago de energía eléctrica',
        cashierId: user.id,
        cashierSnapshotName: user.username,
      }),
    );
    expect(result.id).toBe('expense-1');
  });

  it('rechaza el gasto si no hay un turno abierto', async () => {
    shiftsService.getActiveSummary.mockResolvedValue(null);

    await expect(
      service.create(
        {
          amount: 200,
          category: CashExpenseCategoryDto.OTROS,
          reason: 'Compra de hielo',
        },
        user,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rechaza gastos cuando la política no está configurada', async () => {
    shiftsService.getActiveSummary.mockResolvedValue({ id: 'shift-123', status: ShiftStatus.OPEN });
    configService.getByIdOrDefault.mockResolvedValue({ id: 'petty_cash_policy', data: {} });
    await expect(service.create({ amount: 200, category: CashExpenseCategoryDto.OTROS, reason: 'Compra urgente' }, user)).rejects.toThrow('Configura y guarda la política');
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('exige y valida el PIN de administrador cuando la política lo requiere', async () => {
    shiftsService.getActiveSummary.mockResolvedValue({
      id: 'shift-123',
      status: ShiftStatus.OPEN,
    });
    shiftsService.getSummaryById.mockResolvedValue({
      id: 'shift-123',
      status: ShiftStatus.OPEN,
    });
    configService.getByIdOrDefault.mockResolvedValue({
      id: 'petty_cash_policy',
      data: {
        maxAmountWithoutAuth: 100,
        maxShiftTotal: 2000,
        requireVoucherOver: 0,
        requireVoucherAlways: false,
        categoryPolicies: {},
      },
    });

    await expect(
      service.create(
        {
          amount: 200,
          category: CashExpenseCategoryDto.OTROS,
          reason: 'Compra urgente',
        },
        user,
      ),
    ).rejects.toThrow('requiere autorización');

    usersRepository.findByPin.mockResolvedValue({
      id: 'admin-1',
      role: UserRoleDto.admin,
      isActive: true,
    });
    repo.create.mockResolvedValue({ id: 'expense-2' });

    await service.create(
      {
        amount: 200,
        category: CashExpenseCategoryDto.OTROS,
        reason: 'Compra urgente',
        authorizationPin: '123456',
      },
      user,
    );

    expect(usersRepository.findByPin).toHaveBeenCalledWith('123456', {
      requiredPermissions: ['cash.expenses.authorize'],
      attemptScope: 'cash-expense-authorization',
    });
  });

  it('filtra gastos usando límites de día America/Managua y reenvía limit', async () => {
    repo.list.mockResolvedValue([]);

    await service.list({
      startDate: '2026-11-10',
      endDate: '2026-11-10',
      limit: 50,
    });

    expect(repo.list).toHaveBeenCalledWith({
      shiftId: undefined,
      cashierId: undefined,
      category: undefined,
      from: new Date('2026-11-10T06:00:00.000Z'),
      to: new Date('2026-11-11T05:59:59.999Z'),
      limit: 50,
    });
  });

  it('rechaza fechas inválidas al listar gastos', async () => {
    await expect(service.list({ startDate: 'fecha-invalida' })).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.list({ startDate: '2026-11-31' })).rejects.toThrow(
      BadRequestException,
    );
  });
});
