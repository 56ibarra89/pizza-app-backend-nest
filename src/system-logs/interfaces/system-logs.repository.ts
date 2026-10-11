import type { LogLevel, Prisma } from '@prisma/client';
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
    module?: string;
    operation?: string;
    entity?: string;
    entityId?: string;
    source?: string;
    requestId?: string;
    ipAddress?: string;
    userAgent?: string;
    httpMethod?: string;
    route?: string;
    statusCode?: number;
    success?: boolean;
    durationMs?: number;
    before?: Prisma.InputJsonValue;
    after?: Prisma.InputJsonValue;
    metadata?: Prisma.InputJsonValue;
  }): Promise<SystemLogEntity>;

  findMany(params: {
    limit: number;
    user?: string;
    role?: string;
    action?: string;
    level?: LogLevel;
    startDate?: string;
    endDate?: string;
    search?: string;
    module?: string;
    operation?: string;
    success?: boolean;
  }): Promise<SystemLogEntity[]>;
}
