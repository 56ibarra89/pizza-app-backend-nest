import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ShiftsModule } from '../shifts/shifts.module';
import { CASH_EXPENSES_REPOSITORY } from './interfaces/cash-expenses.repository';
import { PrismaCashExpensesRepository } from './repositories/prisma-cash-expenses.repository';
import { CashExpensesService } from './services/cash-expenses.service';
import { CashExpensesController } from './controllers/cash-expenses.controller';

@Module({
  imports: [PrismaModule, ShiftsModule],
  controllers: [CashExpensesController],
  providers: [
    CashExpensesService,
    {
      provide: CASH_EXPENSES_REPOSITORY,
      useClass: PrismaCashExpensesRepository,
    },
  ],
  exports: [CashExpensesService, CASH_EXPENSES_REPOSITORY],
})
export class CashExpensesModule {}
