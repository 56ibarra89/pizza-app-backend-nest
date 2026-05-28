import { Module } from '@nestjs/common';
import { AppConfigController } from './controllers/app-config.controller';
import { AppConfigService } from './services/app-config.service';
import { APP_CONFIG_REPOSITORY } from './interfaces/app-config.repository';
import { PrismaAppConfigRepository } from './repositories/prisma-app-config.repository';

@Module({
  controllers: [AppConfigController],
  providers: [
    AppConfigService,
    {
      provide: APP_CONFIG_REPOSITORY,
      useClass: PrismaAppConfigRepository,
    },
  ],
  exports: [AppConfigService],
})
export class AppConfigModule {}
