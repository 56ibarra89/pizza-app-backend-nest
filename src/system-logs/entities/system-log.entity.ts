import type { LogLevel } from '@prisma/client';

export type SystemLogEntity = {
  id: number;
  timestamp: Date;
  userId?: string;
  user: string;
  role?: string;
  action: string;
  details?: string;
  level: LogLevel;
};
