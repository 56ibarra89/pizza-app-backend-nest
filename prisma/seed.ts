import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const adminUser = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      id: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
      username: 'admin',
      email: 'admin@pizzaapp.com',
      firstName: 'Admin',
      lastName: 'General',
      pin: '9999',
      passwordHash: 'scrypt$qJO1HLzIxwS7BGaE8MUg7g==$qPilc2T/4HirWbvxIpnAEEMgR2UXB52Xcngtl4spNLJ2VeurguCH5PkYsfSi1U1qTBorXhhLDpcfuj2U1+gs5A==',
      role: 'ADMIN',
      isActive: true,
      failedLoginAttempts: 0,
    },
  });

  console.log('Admin user created/verified:', adminUser);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
