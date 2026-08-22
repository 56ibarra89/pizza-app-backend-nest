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
    discrepancyThreshold: number;
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
    notes?: string;
    discrepancyReason?: string;
    authorizationPin?: string;
    denominationBreakdown?: CashDenominationCount[];
    discrepancyThreshold: number;
    actor: {
      id: string;
      username: string;
      role: string;
    };
  }): Promise<ShiftEntity>;
}
