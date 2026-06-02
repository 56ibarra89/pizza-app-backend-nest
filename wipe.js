const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.mesa.deleteMany();
  await prisma.appConfig.deleteMany({ where: { id: 'floors_config' } });
  console.log('Wiped mesas and config!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
