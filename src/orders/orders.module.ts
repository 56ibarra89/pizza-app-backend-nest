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
import { OrderPricingService } from './services/order-pricing.service';
import { InvoiceIssuingService } from './services/invoice-issuing.service';
import { OrderFinalizationService } from './services/order-finalization.service';
import { HiddenKitchenTicketsService } from './services/hidden-kitchen-tickets.service';
import { OrderReferenceResolverService } from './services/order-reference-resolver.service';
import { OrderTableAssignmentsService } from './services/order-table-assignments.service';
import { OrderCancellationAuthorizationService } from './services/order-cancellation-authorization.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    ProductsModule,
    AppConfigModule,
    PromotionsModule,
    MailerModule,
    UsersModule,
  ],
  controllers: [OrdersController],
  providers: [
    OrdersService,
    OrderPricingService,
    InvoiceIssuingService,
    OrderFinalizationService,
    HiddenKitchenTicketsService,
    OrderReferenceResolverService,
    OrderTableAssignmentsService,
    OrderCancellationAuthorizationService,
    OrderNotificationsListener,
    {
      provide: ORDERS_REPOSITORY,
      useClass: PrismaOrdersRepository,
    },
  ],
})
export class OrdersModule {}
