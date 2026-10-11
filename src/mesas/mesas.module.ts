import { Module } from '@nestjs/common';
import { MesasService } from './mesas.service';
import { MesasController } from './mesas.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AppConfigModule } from '../app-config/app-config.module';
import { SystemLogsModule } from '../system-logs/system-logs.module';

@Module({
  imports: [PrismaModule, AppConfigModule, SystemLogsModule],
  controllers: [MesasController],
  providers: [MesasService],
})
export class MesasModule {}
