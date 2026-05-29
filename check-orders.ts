import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const orders = await prisma.order.findMany({
    orderBy: { timestamp: 'desc' },
    take: 5
  });
  console.log(JSON.stringify(orders.map(o => ({ id: o.id, timestamp: o.timestamp, status: o.status, invoiceNumber: o.invoiceNumber })), null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
