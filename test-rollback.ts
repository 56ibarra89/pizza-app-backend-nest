import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { OrdersService } from './src/orders/services/orders.service';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testRollback() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const ordersService = app.get(OrdersService);
  
  const payload = {
    id: `ORD-ROLLBACK-${Date.now()}`,
    items: [
      {
        name: "Pizza Familiar",
        price: 250,
        size: "familiar",
        quantity: 1,
        extras: [],
        note: "",
        giftQuantity: 0,
        isSentToKitchen: false,
        kitchenStatus: "pending" as any
      }
    ],
    total: 250,
    subTotal: 250,
    taxAmount: 0,
    discountAmount: 0,
    status: "paid" as any,
    timestamp: new Date(),
    customerSnapshotName: "Test Rollback User",
    orderType: "local" as any,
    customerTendered: 300,
    payments: [
      { method: "EFECTIVO" as any, amount: 250 } // VALID: 250 === 250
    ]
  };

  console.log(`Calling ordersService.create with invalid payment amount to force rollback...`);
  
  try {
    await ordersService.create(payload as any);
    console.error('ERROR: Service succeeded, but it should have failed!');
  } catch (error: any) {
    console.log(`Service failed as expected. Error: ${error.message}`);
  }

  // Check if the order is in the database
  const orderInDb = await prisma.order.findUnique({ where: { id: payload.id } });
  
  if (orderInDb) {
    console.error(`ERROR: Rollback failed! Order ${payload.id} was found in the database.`);
    console.log(orderInDb);
  } else {
    console.log(`SUCCESS: Order ${payload.id} was successfully rolled back and is not in the database!`);
  }
  
  await app.close();
  await prisma.$disconnect();
}

testRollback().catch(console.error);
