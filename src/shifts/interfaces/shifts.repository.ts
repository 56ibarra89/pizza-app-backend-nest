import type { ShiftStatus } from '@prisma/client';
import type { ShiftEntity } from '../entities/shift.entity';

export const SHIFTS_REPOSITORY = Symbol('SHIFTS_REPOSITORY');

export interface IShiftsRepository {
  findActive(): Promise<ShiftEntity | null>;
  findById(id: string): Promise<ShiftEntity | null>;
  list(params: { limit: number; status?: ShiftStatus; from?: Date; to?: Date }): Promise<ShiftEntity[]>;
  open(params: {
    cashierId?: string;
    cashierName: string;
    cashRegisterName?: string;
    openingAmount: number;
    notes?: string;
    startTime: Date;
  }): Promise<ShiftEntity>;
  close(params: {
    id: string;
    endTime: Date;
    closingAmount: number;
    notes?: string;
  }): Promise<ShiftEntity>;
}
