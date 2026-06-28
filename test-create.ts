import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { OrdersService } from './src/orders/services/orders.service';
import { PrismaClient } from '@prisma/client';
import { OrderStatusDto } from './src/orders/dto/order-status.dto';
import { OrderTypeDto } from './src/orders/dto/order-type.dto';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const ordersService = app.get(OrdersService);
  const prisma = new PrismaClient();

  try {
    const dto = {
      id: 'ORD-TEST-' + Date.now(),
      items: [{
        name: 'Pizza Test',
        price: 150,
        size: 'familiar',
        quantity: 1,
        extras: [],
      }],
      total: 150,
      subTotal: 150,
      taxAmount: 0,
      discountAmount: 0,
      status: OrderStatusDto.paid,
      orderType: OrderTypeDto.local,
      payments: [
        { method: 'EFECTIVO' as any, amount: 150 }
      ],
      timestamp: new Date().toISOString()
    };

    console.log('Testing create order:', dto.id);
    const result = await ordersService.create(dto as any);
    console.log('Create result:', (result as any).invoiceNumber);
  } catch (error) {
    console.error('Create threw error:', error);
  } finally {
    await prisma.$disconnect();
    await app.close();
  }
}

bootstrap();
