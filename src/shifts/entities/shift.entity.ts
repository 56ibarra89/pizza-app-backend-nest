import type { ShiftStatus } from '@prisma/client';
import type { CashExpenseEntity } from '../../cash-expenses/entities/cash-expense.entity';

export type ShiftEntity = {
  id: string;
  cashierId?: string;
  cashierSnapshotName: string;
  cashRegisterSnapshotName?: string;
  startTime: Date;
  endTime?: Date;
  openingAmount: number;
  closingAmount?: number;
  cashSales: number;
  cardSales: number;
  appSales: number;
  totalSales: number;
  totalExpenses: number;
  expectedCash?: number;
  totalExpensesSnapshot?: number;
  cashDifference?: number;
  discrepancyReason?: string;
  authorizedById?: string;
  authorizedBySnapshotName?: string;
  authorizedByRole?: string;
  denominationBreakdown?: CashDenominationCount[];
  status: ShiftStatus;
  notes?: string;
  expenses?: CashExpenseEntity[];
  createdAt: Date;
  updatedAt: Date;
};

export type CashDenominationCount = {
  denomination: number;
  quantity: number;
};

export type ShiftCloseBlockingOrder = {
  id: string;
  invoiceNumber?: string;
  status: string;
  tables: string[];
};

export type ShiftCloseBlockingTable = {
  id: string;
  label: string;
  orderIds: string[];
};

export type ShiftClosePreview = {
  shiftId: string;
  openingAmount: number;
  sales: {
    cash: number;
    card: number;
    app: number;
    total: number;
  };
  expenses: CashExpenseEntity[];
  totalExpenses: number;
  expectedCash: number;
  discrepancyThreshold: number;
  blockingOrders: ShiftCloseBlockingOrder[];
  blockingTables: ShiftCloseBlockingTable[];
  canClose: boolean;
};
