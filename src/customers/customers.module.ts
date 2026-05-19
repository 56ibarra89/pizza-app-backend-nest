import { Module } from '@nestjs/common';
import { CustomersController } from './controllers/customers.controller';
import { CustomersService } from './services/customers.service';
import { CUSTOMERS_REPOSITORY } from './interfaces/customers.repository';
import { PrismaCustomersRepository } from './repositories/prisma-customers.repository';

@Module({
  controllers: [CustomersController],
  providers: [
    CustomersService,
    {
      provide: CUSTOMERS_REPOSITORY,
      useClass: PrismaCustomersRepository,
    },
  ],
})
export class CustomersModule {}
