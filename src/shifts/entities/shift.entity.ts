import type { ShiftStatus } from '@prisma/client';

export type ShiftEntity = {
  id: string;
  cashierId?: string;
  cashierName: string;
  cashRegisterName?: string;
  startTime: Date;
  endTime?: Date;
  openingAmount: number;
  closingAmount?: number;
  cashSales: number;
  cardSales: number;
  appSales: number;
  totalSales: number;
  status: ShiftStatus;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
};
