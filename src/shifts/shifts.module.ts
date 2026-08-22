import { Module } from '@nestjs/common';
import { ShiftsController } from './controllers/shifts.controller';
import { ShiftsService } from './services/shifts.service';
import { SHIFTS_REPOSITORY } from './interfaces/shifts.repository';
import { PrismaShiftsRepository } from './repositories/prisma-shifts.repository';
import { AppConfigModule } from '../app-config/app-config.module';

@Module({
  imports: [AppConfigModule],
  controllers: [ShiftsController],
  providers: [
    ShiftsService,
    {
      provide: SHIFTS_REPOSITORY,
      useClass: PrismaShiftsRepository,
    },
  ],
  exports: [ShiftsService],
})
export class ShiftsModule {}
