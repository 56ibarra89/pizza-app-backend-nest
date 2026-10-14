import { Injectable } from '@nestjs/common';
import { LogLevel, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  ISystemLogsRepository,
  SystemLogCreateParams,
} from '../interfaces/system-logs.repository';
import type { SystemLogEntity } from '../entities/system-log.entity';

@Injectable()
export class PrismaSystemLogsRepository implements ISystemLogsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(params: SystemLogCreateParams): Promise<SystemLogEntity> {
    const created = await this.prisma.systemLog.create({
      data: this.toCreateData(params),
    });

    return this.map(created);
  }

  async createMany(params: SystemLogCreateParams[]): Promise<number> {
    if (params.length === 0) return 0;
    const result = await this.prisma.systemLog.createMany({
      data: params.map((entry) => this.toCreateData(entry)),
    });
    return result.count;
  }

  async findMany(params: {
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
  }): Promise<SystemLogEntity[]> {
    const where: Prisma.SystemLogWhereInput = {};

    if (params.user && params.user.trim()) {
      where.user = { contains: params.user.trim(), mode: 'insensitive' };
    }

    if (
      params.role &&
      params.role.trim() &&
      params.role.toUpperCase() !== 'ALL'
    ) {
      where.role = { equals: params.role.trim(), mode: 'insensitive' };
    }

    if (
      params.action &&
      params.action.trim() &&
      params.action.toUpperCase() !== 'ALL'
    ) {
      where.action = { contains: params.action.trim(), mode: 'insensitive' };
    }

    if (params.level) {
      where.level = params.level;
    }

    if (
      params.module &&
      params.module.trim() &&
      params.module.toUpperCase() !== 'ALL'
    ) {
      where.module = { equals: params.module.trim(), mode: 'insensitive' };
    }

    if (
      params.operation &&
      params.operation.trim() &&
      params.operation.toUpperCase() !== 'ALL'
    ) {
      where.operation = {
        equals: params.operation.trim(),
        mode: 'insensitive',
      };
    }

    if (params.success !== undefined) {
      where.success = params.success;
    }

    if (params.startDate || params.endDate) {
      const timestamp: Prisma.DateTimeFilter = {};
      if (params.startDate) {
        const start = new Date(params.startDate);
        if (!isNaN(start.getTime())) {
          timestamp.gte = start;
        }
      }
      if (params.endDate) {
        const end = new Date(params.endDate);
        if (!isNaN(end.getTime())) {
          if (params.endDate.length <= 10) {
            end.setHours(23, 59, 59, 999);
          }
          timestamp.lte = end;
        }
      }
      where.timestamp = timestamp;
    }

    if (params.search && params.search.trim()) {
      const query = params.search.trim();
      where.OR = [
        { user: { contains: query, mode: 'insensitive' } },
        { action: { contains: query, mode: 'insensitive' } },
        { details: { contains: query, mode: 'insensitive' } },
        { module: { contains: query, mode: 'insensitive' } },
        { entity: { contains: query, mode: 'insensitive' } },
        { entityId: { contains: query, mode: 'insensitive' } },
        { requestId: { contains: query, mode: 'insensitive' } },
      ];
    }

    const rows = await this.prisma.systemLog.findMany({
      take: params.limit,
      orderBy: { timestamp: 'desc' },
      where,
    });
    return rows.map((r) => this.map(r));
  }

  private map(row: {
    id: number;
    timestamp: Date;
    userId: string | null;
    user: string;
    role: string | null;
    action: string;
    details: string | null;
    level: LogLevel;
    module: string | null;
    operation: string | null;
    entity: string | null;
    entityId: string | null;
    source: string | null;
    requestId: string | null;
    ipAddress: string | null;
    userAgent: string | null;
    httpMethod: string | null;
    route: string | null;
    statusCode: number | null;
    success: boolean;
    durationMs: number | null;
    before: Prisma.JsonValue | null;
    after: Prisma.JsonValue | null;
    metadata: Prisma.JsonValue | null;
  }): SystemLogEntity {
    return {
      id: row.id,
      timestamp: row.timestamp,
      userId: row.userId ?? undefined,
      user: row.user,
      role: row.role ?? undefined,
      action: row.action,
      details: row.details ?? undefined,
      level: row.level,
      module: row.module ?? undefined,
      operation: row.operation ?? undefined,
      entity: row.entity ?? undefined,
      entityId: row.entityId ?? undefined,
      source: row.source ?? undefined,
      requestId: row.requestId ?? undefined,
      ipAddress: row.ipAddress ?? undefined,
      userAgent: row.userAgent ?? undefined,
      httpMethod: row.httpMethod ?? undefined,
      route: row.route ?? undefined,
      statusCode: row.statusCode ?? undefined,
      success: row.success,
      durationMs: row.durationMs ?? undefined,
      before: row.before ?? undefined,
      after: row.after ?? undefined,
      metadata: row.metadata ?? undefined,
    };
  }

  private toCreateData(
    params: SystemLogCreateParams,
  ): Prisma.SystemLogCreateManyInput {
    return {
      userId: params.userId,
      user: params.user,
      role: params.role,
      action: params.action,
      details: params.details,
      level: params.level ?? LogLevel.INFO,
      module: params.module,
      operation: params.operation,
      entity: params.entity,
      entityId: params.entityId,
      source: params.source,
      requestId: params.requestId,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      httpMethod: params.httpMethod,
      route: params.route,
      statusCode: params.statusCode,
      success: params.success ?? true,
      durationMs: params.durationMs,
      before: params.before,
      after: params.after,
      metadata: params.metadata,
    };
  }
}
