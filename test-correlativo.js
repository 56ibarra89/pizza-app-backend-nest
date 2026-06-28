const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.correlativo.create({
  data: {
    documentType: 'FACTURA',
    resolutionNumber: 'AUTO-TEST',
    prefix: 'TEST-',
    startNumber: 1,
    endNumber: 99999,
    currentNumber: 1,
    issueDate: new Date(),
    expirationDate: new Date(),
    status: 'ACTIVO'
  }
}).then(console.log).catch(console.error).finally(() => prisma.$disconnect());
