import { Module } from '@nestjs/common';
import { ShiftsController } from './controllers/shifts.controller';
import { ShiftsService } from './services/shifts.service';
import { SHIFTS_REPOSITORY } from './interfaces/shifts.repository';
import { PrismaShiftsRepository } from './repositories/prisma-shifts.repository';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [UsersModule],
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
