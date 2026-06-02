import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
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
import { ApiKeyGuard } from './common/guards/api-key.guard';
import { MesasModule } from './mesas/mesas.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 120,
      },
    ]),
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
    MesasModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ApiKeyGuard,
    },
  ],
})
export class AppModule {}
