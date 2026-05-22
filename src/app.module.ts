import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { CustomersModule } from './customers/customers.module';
import { UsersModule } from './users/users.module';
import { OrdersModule } from './orders/orders.module';
import { PromotionsModule } from './promotions/promotions.module';
import { AppConfigModule } from './app-config/app-config.module';
import { SystemLogsModule } from './system-logs/system-logs.module';
import { CorrelativosModule } from './correlativos/correlativos.module';
import { ShiftsModule } from './shifts/shifts.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    ProductsModule,
    CustomersModule,
    UsersModule,
    OrdersModule,
    PromotionsModule,
    AppConfigModule,
    SystemLogsModule,
    CorrelativosModule,
    ShiftsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
