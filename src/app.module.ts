import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { MailerModule } from '@nestjs-modules/mailer';
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
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { MesasModule } from './mesas/mesas.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { NotificationsModule } from './notifications/notifications.module';
import { KitchensModule } from './kitchens/kitchens.module';
import { CashExpensesModule } from './cash-expenses/cash-expenses.module';
import { AdminDashboardModule } from './admin-dashboard/admin-dashboard.module';
import { DevicesModule } from './devices/devices.module';
import { BackupsModule } from './backups/backups.module';
import { SecurityModule } from './common/security/security.module';
import { AccessControlModule } from './access-control/access-control.module';
import { ReportsModule } from './reports/reports.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    SecurityModule,
    AccessControlModule,
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 120,
      },
    ]),
    MailerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const parsedPort = Number.parseInt(
          config.get<string>('SMTP_PORT') || '587',
          10,
        );
        return {
          transport: {
            host: config.get<string>('SMTP_HOST') || 'smtp.ethereal.email',
            port: Number.isFinite(parsedPort) ? parsedPort : 587,
            auth: {
              user:
                config.get<string>('SMTP_USER') ||
                'ethereal.user@ethereal.email',
              pass: config.get<string>('SMTP_PASS') || 'etherealpassword',
            },
          },
          defaults: {
            from: '"No Reply" <noreply@pizzatogo.com>',
          },
        };
      },
    }),
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
    EventEmitterModule.forRoot(),
    NotificationsModule,
    KitchensModule,
    CashExpensesModule,
    AdminDashboardModule,
    DevicesModule,
    BackupsModule,
    ReportsModule,
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
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
