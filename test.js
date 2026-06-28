const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  try {
    const lockedRows = await prisma.$queryRaw`
      SELECT id FROM "Correlativo"
      WHERE "documentType" = 'FACTURA' AND "status" = 'ACTIVO'
      LIMIT 1
      FOR UPDATE
    `;
    console.log(lockedRows);
  } catch (err) {
    console.error("Error executing query:", err);
  } finally {
    await prisma.$disconnect();
  }
}

run();
