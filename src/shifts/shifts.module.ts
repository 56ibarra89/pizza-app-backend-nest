import { Module } from '@nestjs/common';
import { ShiftsController } from './controllers/shifts.controller';
import { ShiftsService } from './services/shifts.service';
import { SHIFTS_REPOSITORY } from './interfaces/shifts.repository';
import { PrismaShiftsRepository } from './repositories/prisma-shifts.repository';

@Module({
  controllers: [ShiftsController],
  providers: [
    ShiftsService,
    {
      provide: SHIFTS_REPOSITORY,
      useClass: PrismaShiftsRepository,
    },
  ],
})
export class ShiftsModule {}
