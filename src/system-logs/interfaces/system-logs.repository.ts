import type { LogLevel } from '@prisma/client';
import type { SystemLogEntity } from '../entities/system-log.entity';

export const SYSTEM_LOGS_REPOSITORY = Symbol('SYSTEM_LOGS_REPOSITORY');

export interface ISystemLogsRepository {
  create(params: {
    userId?: string;
    user: string;
    role?: string;
    action: string;
    details?: string;
    level?: LogLevel;
  }): Promise<SystemLogEntity>;

  findMany(params: {
    limit: number;
    user?: string;
    action?: string;
    level?: LogLevel;
  }): Promise<SystemLogEntity[]>;
}
