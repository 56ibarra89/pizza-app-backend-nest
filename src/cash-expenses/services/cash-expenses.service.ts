import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ShiftStatus } from '@prisma/client';
import {
  CASH_EXPENSES_REPOSITORY,
  type ICashExpensesRepository,
} from '../interfaces/cash-expenses.repository';
import { CreateCashExpenseDto } from '../dto/create-cash-expense.dto';
import { ListCashExpensesQueryDto } from '../dto/list-cash-expenses-query.dto';
import { ShiftsService } from '../../shifts/services/shifts.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { CashExpenseEntity } from '../entities/cash-expense.entity';

@Injectable()
export class CashExpensesService {
  constructor(
    @Inject(CASH_EXPENSES_REPOSITORY)
    private readonly repo: ICashExpensesRepository,
    private readonly shiftsService: ShiftsService,
  ) {}

  async create(
    dto: CreateCashExpenseDto,
    user: AuthenticatedUser,
  ): Promise<CashExpenseEntity> {
    let targetShiftId = dto.shiftId;

    if (!targetShiftId) {
      const activeShift = await this.shiftsService.getActive();
      if (!activeShift) {
        throw new BadRequestException(
          'Debes tener un turno de caja abierto para registrar un gasto.',
        );
      }
      targetShiftId = activeShift.id;
    }

    const shift = await this.shiftsService.getById(targetShiftId);
    if (shift.status !== ShiftStatus.OPEN) {
      throw new BadRequestException(
        'Solo se pueden registrar gastos en un turno que esté actualmente abierto.',
      );
    }

    const cashierSnapshotName = user.username || 'Cajero';

    return this.repo.create({
      shiftId: targetShiftId,
      amount: dto.amount,
      category: dto.category,
      reason: dto.reason.trim(),
      voucherNumber: dto.voucherNumber?.trim() || undefined,
      notes: dto.notes?.trim() || undefined,
      cashierId: user.id,
      cashierSnapshotName,
    });
  }

  async list(query: ListCashExpensesQueryDto): Promise<CashExpenseEntity[]> {
    const from = query.startDate ? new Date(query.startDate) : undefined;
    const to = query.endDate ? new Date(query.endDate) : undefined;

    return this.repo.list({
      shiftId: query.shiftId,
      cashierId: query.cashierId,
      category: query.category,
      from,
      to,
    });
  }

  async listByShiftId(shiftId: string): Promise<CashExpenseEntity[]> {
    return this.repo.listByShiftId(shiftId);
  }

  async getById(id: string): Promise<CashExpenseEntity> {
    const found = await this.repo.findById(id);
    if (!found) {
      throw new NotFoundException('Gasto no encontrado');
    }
    return found;
  }
}
