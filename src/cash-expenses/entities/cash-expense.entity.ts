import { CashExpenseCategoryDto } from '../dto/cash-expense-category.dto';

export interface CashExpenseEntity {
  id: string;
  shiftId: string;
  amount: number;
  category: CashExpenseCategoryDto;
  reason: string;
  voucherNumber?: string;
  notes?: string;
  cashierId?: string;
  cashierSnapshotName: string;
  createdAt: Date;
  updatedAt: Date;
}
