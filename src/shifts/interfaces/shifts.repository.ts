import type { ShiftStatus } from '@prisma/client';
import type {
  CashDenominationCount,
  ShiftClosePreview,
  ShiftEntity,
} from '../entities/shift.entity';

export const SHIFTS_REPOSITORY = Symbol('SHIFTS_REPOSITORY');

export interface ShiftStatusSummary {
  id: string;
  status: ShiftStatus;
}

export interface IShiftsRepository {
  findActive(): Promise<ShiftEntity | null>;
  findActiveSummary(): Promise<ShiftStatusSummary | null>;
  findActiveForCashier(params: {
    cashierId: string;
    cashierSnapshotName: string;
  }): Promise<ShiftEntity | null>;
  findById(id: string): Promise<ShiftEntity | null>;
  findSummaryById(id: string): Promise<ShiftStatusSummary | null>;
  getClosePreview(params: {
    id: string;
    closeType?: 'HANDOVER' | 'END_OF_DAY';
  }): Promise<ShiftClosePreview>;
  list(params: {
    limit: number;
    status?: ShiftStatus;
    from?: Date;
    to?: Date;
  }): Promise<ShiftEntity[]>;
  open(params: {
    cashierId?: string;
    cashierSnapshotName: string;
    cashRegisterSnapshotName?: string;
    openingAmount: number;
    notes?: string;
    startTime: Date;
  }): Promise<ShiftEntity>;
  close(params: {
    id: string;
    endTime: Date;
    closingAmount: number;
    countedUsd?: number;
    declaredCardAmount?: number;
    declaredAppAmount?: number;
    notes?: string;
    discrepancyReason?: string;
    authorizationPin?: string;
    denominationBreakdown?: CashDenominationCount[];
    usdDenominationBreakdown?: CashDenominationCount[];
    closeType?: 'HANDOVER' | 'END_OF_DAY';
    actor: {
      id: string;
      username: string;
      role: string;
    };
  }): Promise<ShiftEntity>;
}
