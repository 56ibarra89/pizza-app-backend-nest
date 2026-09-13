import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ShiftsModule } from '../shifts/shifts.module';
import { CASH_EXPENSES_REPOSITORY } from './interfaces/cash-expenses.repository';
import { PrismaCashExpensesRepository } from './repositories/prisma-cash-expenses.repository';
import { CashExpensesService } from './services/cash-expenses.service';
import { CashExpensesController } from './controllers/cash-expenses.controller';
import { AppConfigModule } from '../app-config/app-config.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [PrismaModule, ShiftsModule, AppConfigModule, UsersModule],
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
