import { Module } from '@nestjs/common';
import { AppConfigModule } from '../app-config/app-config.module';
import { BackupsController } from './backups.controller';
import { BackupsService } from './backups.service';
import { SystemLogsModule } from '../system-logs/system-logs.module';
import {
  CLOUD_BACKUP_PROVIDER,
  LocalFirstCloudBackupProvider,
} from './interfaces/cloud-backup-provider.interface';

@Module({
  imports: [AppConfigModule, SystemLogsModule],
  controllers: [BackupsController],
  providers: [
    BackupsService,
    {
      provide: CLOUD_BACKUP_PROVIDER,
      useClass: LocalFirstCloudBackupProvider,
    },
  ],
  exports: [BackupsService],
})
export class BackupsModule {}
