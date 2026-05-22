import { Module } from '@nestjs/common';
import { SystemLogsController } from './controllers/system-logs.controller';
import { SystemLogsService } from './services/system-logs.service';
import { SYSTEM_LOGS_REPOSITORY } from './interfaces/system-logs.repository';
import { PrismaSystemLogsRepository } from './repositories/prisma-system-logs.repository';

@Module({
  controllers: [SystemLogsController],
  providers: [
    SystemLogsService,
    {
      provide: SYSTEM_LOGS_REPOSITORY,
      useClass: PrismaSystemLogsRepository,
    },
  ],
})
export class SystemLogsModule {}
