import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
prisma.appConfig.findUnique({ where: { id: 'floors_config' } })
  .then(res => console.log(JSON.stringify(res, null, 2)))
  .catch(console.error)
  .finally(() => prisma.$disconnect());
