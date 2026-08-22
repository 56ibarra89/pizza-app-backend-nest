import { CashExpenseCategoryDto } from '../dto/cash-expense-category.dto';
import { CashExpenseEntity } from '../entities/cash-expense.entity';

export const CASH_EXPENSES_REPOSITORY = 'CASH_EXPENSES_REPOSITORY';

export interface CreateCashExpenseParams {
  shiftId: string;
  amount: number;
  category: CashExpenseCategoryDto;
  reason: string;
  voucherNumber?: string;
  notes?: string;
  cashierId?: string;
  cashierSnapshotName: string;
}

export interface ListCashExpensesParams {
  shiftId?: string;
  cashierId?: string;
  category?: CashExpenseCategoryDto;
  from?: Date;
  to?: Date;
}

export interface ICashExpensesRepository {
  create(data: CreateCashExpenseParams): Promise<CashExpenseEntity>;
  findById(id: string): Promise<CashExpenseEntity | null>;
  list(params: ListCashExpensesParams): Promise<CashExpenseEntity[]>;
  listByShiftId(shiftId: string): Promise<CashExpenseEntity[]>;
  getTotalExpensesByShiftId(shiftId: string): Promise<number>;
}
