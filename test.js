const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.appConfig.findUnique({ where: { id: 'floors_config' } })
  .then(c => console.log(JSON.stringify(c)))
  .finally(() => prisma.$disconnect());
