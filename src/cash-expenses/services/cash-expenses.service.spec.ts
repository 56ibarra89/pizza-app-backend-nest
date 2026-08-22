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
  };

  const user: AuthenticatedUser = {
    id: 'user-cajero-1',
    username: 'cajero1',
    role: UserRoleDto.cajero,
  };

  let service: CashExpensesService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CashExpensesService(repo as any, shiftsService as any);
  });

  it('registra un gasto exitosamente en el turno activo', async () => {
    shiftsService.getActive.mockResolvedValue({
      id: 'shift-123',
      status: ShiftStatus.OPEN,
    });
    shiftsService.getById.mockResolvedValue({
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

    expect(shiftsService.getActive).toHaveBeenCalled();
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
    shiftsService.getActive.mockResolvedValue(null);

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
});
