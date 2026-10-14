import { Module } from '@nestjs/common';
import { SystemLogsController } from './controllers/system-logs.controller';
import { SystemLogsService } from './services/system-logs.service';
import { SYSTEM_LOGS_REPOSITORY } from './interfaces/system-logs.repository';
import { PrismaSystemLogsRepository } from './repositories/prisma-system-logs.repository';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AutomaticAuditInterceptor } from './audit/automatic-audit.interceptor';
import { AuditSnapshotService } from './audit/audit-snapshot.service';
import { AuditWriteQueueService } from './audit/audit-write-queue.service';

@Module({
  controllers: [SystemLogsController],
  providers: [
    SystemLogsService,
    AuditSnapshotService,
    AuditWriteQueueService,
    {
      provide: SYSTEM_LOGS_REPOSITORY,
      useClass: PrismaSystemLogsRepository,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AutomaticAuditInterceptor,
    },
  ],
  exports: [SystemLogsService],
})
export class SystemLogsModule {}
