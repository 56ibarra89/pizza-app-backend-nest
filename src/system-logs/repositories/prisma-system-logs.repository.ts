import { Injectable } from '@nestjs/common';
import { LogLevel } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { ISystemLogsRepository } from '../interfaces/system-logs.repository';
import type { SystemLogEntity } from '../entities/system-log.entity';

@Injectable()
export class PrismaSystemLogsRepository implements ISystemLogsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(params: {
    userId?: string;
    user: string;
    role?: string;
    action: string;
    details?: string;
    level?: LogLevel;
  }): Promise<SystemLogEntity> {
    const created = await this.prisma.systemLog.create({
      data: {
        userId: params.userId,
        user: params.user,
        role: params.role,
        action: params.action,
        details: params.details,
        level: params.level ?? LogLevel.INFO,
      },
    });

    return this.map(created);
  }

  async findMany(params: {
    limit: number;
    user?: string;
    action?: string;
    level?: LogLevel;
  }): Promise<SystemLogEntity[]> {
    const rows = await this.prisma.systemLog.findMany({
      take: params.limit,
      orderBy: { timestamp: 'desc' },
      where: {
        user: params.user,
        action: params.action,
        level: params.level,
      },
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
    };
  }
}
