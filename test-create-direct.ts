import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { OrdersService } from './src/orders/services/orders.service';
import { OrderStatusDto } from './src/orders/dto/order-status.dto';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const ordersService = app.get(OrdersService);

  const dto = {
    items: [{
      name: "test",
      price: 150,
      size: "unico",
      quantity: 1,
      extras: [],
      giftQuantity: 0,
      isSentToKitchen: true,
      kitchenStatus: "pending"
    }],
    total: 150,
    subTotal: 150,
    taxAmount: 0,
    discountAmount: 0,
    status: "paid" as any,
    orderType: "local" as any,
    customerTendered: 200,
    payments: [{ method: "EFECTIVO" as any, amount: 150 }]
  };

  try {
    const result = await ordersService.create(dto as any);
    console.log('Create result invoice:', (result as any).invoice);
    console.log('Create result status:', (result as any).status);
  } catch (err) {
    console.error('Create error:', err);
  }

  await app.close();
}

bootstrap();
