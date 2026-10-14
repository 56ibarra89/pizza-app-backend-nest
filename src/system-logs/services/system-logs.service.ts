import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import {
  SYSTEM_LOGS_REPOSITORY,
  type ISystemLogsRepository,
  type SystemLogCreateParams,
} from '../interfaces/system-logs.repository';
import type { CreateSystemLogDto } from '../dto/create-system-log.dto';
import type { GetSystemLogsQueryDto } from '../dto/get-system-logs-query.dto';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';

export interface AutomaticAuditParams {
  user: AuthenticatedUser;
  action: string;
  module: string;
  operation: string;
  entity: string;
  entityId?: string;
  source: string;
  requestId: string;
  ipAddress?: string;
  userAgent?: string;
  httpMethod: string;
  route: string;
  statusCode: number;
  success: boolean;
  durationMs: number;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class SystemLogsService {
  constructor(
    @Inject(SYSTEM_LOGS_REPOSITORY)
    private readonly repo: ISystemLogsRepository,
  ) {}

  create(dto: CreateSystemLogDto, user: AuthenticatedUser) {
    return this.repo.create({
      userId: user.id,
      user: user.username,
      role: user.role,
      action: dto.action,
      details: dto.details,
      level: dto.level,
    });
  }

  createAutomatic(params: AutomaticAuditParams) {
    return this.repo.create(this.toAutomaticLog(params));
  }

  createAutomaticBatch(params: AutomaticAuditParams[]) {
    return this.repo.createMany(
      params.map((entry) => this.toAutomaticLog(entry)),
    );
  }

  private toAutomaticLog(params: AutomaticAuditParams): SystemLogCreateParams {
    return {
      userId: params.user.id,
      user: params.user.username,
      role: params.user.role,
      action: params.action,
      details: `${params.operation} ${params.route} (${params.statusCode})`,
      level: params.success ? undefined : 'ERROR',
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
      success: params.success,
      durationMs: params.durationMs,
      before: params.before,
      after: params.after,
      metadata: params.metadata,
    };
  }

  createProcess(params: {
    process: string;
    action: string;
    module: string;
    operation: string;
    entity: string;
    entityId?: string;
    success?: boolean;
    before?: unknown;
    after?: unknown;
    metadata?: unknown;
  }) {
    const toJson = (value: unknown): Prisma.InputJsonValue | undefined =>
      value === undefined
        ? undefined
        : (JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue);

    return this.repo.create({
      user: params.process,
      role: 'SYSTEM',
      action: params.action,
      details: `${params.operation} automático ejecutado por ${params.process}`,
      level: params.success === false ? 'ERROR' : undefined,
      module: params.module,
      operation: params.operation,
      entity: params.entity,
      entityId: params.entityId,
      source: 'PROCESS',
      requestId: randomUUID(),
      success: params.success ?? true,
      before: toJson(params.before),
      after: toJson(params.after),
      metadata: toJson(params.metadata),
    });
  }

  getMany(query: GetSystemLogsQueryDto) {
    const limit = query.limit ?? 200;
    return this.repo.findMany({
      limit,
      user: query.user,
      role: query.role,
      action: query.action,
      level: query.level,
      startDate: query.startDate,
      endDate: query.endDate,
      search: query.search,
      module: query.module,
      operation: query.operation,
      success: query.success,
    });
  }
}
