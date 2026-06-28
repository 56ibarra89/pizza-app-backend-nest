import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { OrdersService } from './src/orders/services/orders.service';
import { OrderStatusDto } from './src/orders/dto/order-status.dto';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const ordersService = app.get(OrdersService);

  try {
    const result = await ordersService.finalize('ORD-1782012817650', {
      status: OrderStatusDto.delivered,
      payments: [
        { method: 'EFECTIVO' as any, amount: 150 }
      ],
    });
    console.log('Finalize result:', (result as any).invoice);
  } catch (err) {
    console.error('Finalize error:', err);
  }

  await app.close();
}

bootstrap();
