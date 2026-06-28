const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('./dist/app.module');
const { OrdersService } = require('./dist/orders/services/orders.service');
const { PrismaClient } = require('@prisma/client');

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const ordersService = app.get(OrdersService);
  const prisma = new PrismaClient();

  try {
    const lastOrder = await prisma.order.findFirst({
      orderBy: { timestamp: 'desc' },
    });

    console.log('Testing finalize on order:', lastOrder.id);
    const result = await ordersService.finalize(lastOrder.id, {
      status: 'PAID',
    });
    console.log('Finalize result:', result.invoiceNumber);
  } catch (error) {
    console.error('Finalize threw error:', error);
  } finally {
    await prisma.$disconnect();
    await app.close();
  }
}

bootstrap();
