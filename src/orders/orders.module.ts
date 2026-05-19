import { Module } from '@nestjs/common';
import { OrdersController } from './controllers/orders.controller';
import { PrismaOrdersRepository } from './repositories/prisma-orders.repository';
import { ORDERS_REPOSITORY } from './interfaces/orders.repository';
import { OrdersService } from './services/orders.service';

@Module({
  controllers: [OrdersController],
  providers: [
    OrdersService,
    {
      provide: ORDERS_REPOSITORY,
      useClass: PrismaOrdersRepository,
    },
  ],
})
export class OrdersModule {}
