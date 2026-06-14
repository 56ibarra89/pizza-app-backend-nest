const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    console.log("Casting OrderItem.size...");
    await prisma.$executeRawUnsafe(`ALTER TABLE "OrderItem" ALTER COLUMN "size" TYPE TEXT USING size::text;`);
    console.log("Casting ProductPrice.size...");
    await prisma.$executeRawUnsafe(`ALTER TABLE "ProductPrice" ALTER COLUMN "size" TYPE TEXT USING size::text;`);
    console.log("Casting ExtraPrice.size...");
    await prisma.$executeRawUnsafe(`ALTER TABLE "ExtraPrice" ALTER COLUMN "size" TYPE TEXT USING size::text;`);
    console.log("Dropping enum ProductSize...");
    await prisma.$executeRawUnsafe(`DROP TYPE "ProductSize";`);
    console.log("Success!");
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
