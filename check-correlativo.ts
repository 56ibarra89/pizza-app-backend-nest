import { PrismaClient } from '@prisma/client'; const prisma = new PrismaClient(); async function run() { const c = await prisma.correlativo.findMany(); console.log(c); } run();
