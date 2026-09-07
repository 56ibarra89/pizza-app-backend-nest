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
    role?: string;
    action?: string;
    level?: LogLevel;
    startDate?: string;
    endDate?: string;
    search?: string;
  }): Promise<SystemLogEntity[]> {
    const where: any = {};

    if (params.user && params.user.trim()) {
      where.user = { contains: params.user.trim(), mode: 'insensitive' };
    }

    if (params.role && params.role.trim() && params.role.toUpperCase() !== 'ALL') {
      where.role = { equals: params.role.trim(), mode: 'insensitive' };
    }

    if (params.action && params.action.trim() && params.action.toUpperCase() !== 'ALL') {
      where.action = { contains: params.action.trim(), mode: 'insensitive' };
    }

    if (params.level) {
      where.level = params.level;
    }

    if (params.startDate || params.endDate) {
      where.timestamp = {};
      if (params.startDate) {
        const start = new Date(params.startDate);
        if (!isNaN(start.getTime())) {
          where.timestamp.gte = start;
        }
      }
      if (params.endDate) {
        const end = new Date(params.endDate);
        if (!isNaN(end.getTime())) {
          if (params.endDate.length <= 10) {
            end.setHours(23, 59, 59, 999);
          }
          where.timestamp.lte = end;
        }
      }
    }

    if (params.search && params.search.trim()) {
      const query = params.search.trim();
      where.OR = [
        { user: { contains: query, mode: 'insensitive' } },
        { action: { contains: query, mode: 'insensitive' } },
        { details: { contains: query, mode: 'insensitive' } },
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
