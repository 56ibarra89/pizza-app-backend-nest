import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { OrdersService } from './src/orders/services/orders.service';
import { PrismaClient } from '@prisma/client';
import { OrderStatusDto } from './src/orders/dto/order-status.dto';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const ordersService = app.get(OrdersService);
  const prisma = new PrismaClient();

  try {
    const lastOrder = await prisma.order.findFirst({
      orderBy: { timestamp: 'desc' },
    });

    console.log('Testing finalize on order:', lastOrder?.id);
    const result = await ordersService.finalize(lastOrder!.id, {
      status: OrderStatusDto.paid,
    });
    console.log('Finalize result:', (result as any)?.invoiceNumber);
  } catch (error) {
    console.error('Finalize threw error:', error);
  } finally {
    await prisma.$disconnect();
    await app.close();
  }
}

bootstrap();
