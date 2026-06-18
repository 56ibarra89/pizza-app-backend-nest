import { Module } from '@nestjs/common';
import { OrdersController } from './controllers/orders.controller';
import { PrismaOrdersRepository } from './repositories/prisma-orders.repository';
import { ORDERS_REPOSITORY } from './interfaces/orders.repository';
import { OrdersService } from './services/orders.service';
import { ProductsModule } from '../products/products.module';
import { AppConfigModule } from '../app-config/app-config.module';
import { PromotionsModule } from '../promotions/promotions.module';
import { MailerModule } from '@nestjs-modules/mailer';
import { OrderNotificationsListener } from './listeners/order-notifications.listener';

@Module({
  imports: [ProductsModule, AppConfigModule, PromotionsModule, MailerModule],
  controllers: [OrdersController],
  providers: [
    OrdersService,
    OrderNotificationsListener,
    {
      provide: ORDERS_REPOSITORY,
      useClass: PrismaOrdersRepository,
    },
  ],
})
export class OrdersModule {}
