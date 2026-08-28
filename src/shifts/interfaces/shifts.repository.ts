import type { ShiftStatus } from '@prisma/client';
import type {
  CashDenominationCount,
  ShiftClosePreview,
  ShiftEntity,
} from '../entities/shift.entity';

export const SHIFTS_REPOSITORY = Symbol('SHIFTS_REPOSITORY');

export interface IShiftsRepository {
  findActive(): Promise<ShiftEntity | null>;
  findActiveForCashier(params: {
    cashierId: string;
    cashierSnapshotName: string;
  }): Promise<ShiftEntity | null>;
  findById(id: string): Promise<ShiftEntity | null>;
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
    declaredCardAmount?: number;
    declaredAppAmount?: number;
    notes?: string;
    discrepancyReason?: string;
    authorizationPin?: string;
    denominationBreakdown?: CashDenominationCount[];
    closeType?: 'HANDOVER' | 'END_OF_DAY';
    actor: {
      id: string;
      username: string;
      role: string;
    };
  }): Promise<ShiftEntity>;
}
