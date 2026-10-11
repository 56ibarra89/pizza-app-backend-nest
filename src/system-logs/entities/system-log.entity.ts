import type { LogLevel, Prisma } from '@prisma/client';

export type SystemLogEntity = {
  id: number;
  timestamp: Date;
  userId?: string;
  user: string;
  role?: string;
  action: string;
  details?: string;
  level: LogLevel;
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
  success: boolean;
  durationMs?: number;
  before?: Prisma.JsonValue;
  after?: Prisma.JsonValue;
  metadata?: Prisma.JsonValue;
};
