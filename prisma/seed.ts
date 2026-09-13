import { PrismaClient } from '@prisma/client';
import {
  createPinLookup,
  hashCredential,
} from '../src/common/security/credential-hasher';

const prisma = new PrismaClient();

async function main() {
  const username = (process.env.SEED_ADMIN_USERNAME || 'admin')
    .trim()
    .toLowerCase();
  const email =
    process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase() || undefined;
  const password = process.env.SEED_ADMIN_PASSWORD;
  const pin = process.env.SEED_ADMIN_PIN;
  const pinPepper = process.env.PIN_PEPPER;

  if (!password || !pin || !pinPepper) {
    throw new Error(
      'SEED_ADMIN_PASSWORD, SEED_ADMIN_PIN and PIN_PEPPER are required to seed the administrator.',
    );
  }
  if (
    !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,128}$/.test(
      password,
    )
  ) {
    throw new Error('SEED_ADMIN_PASSWORD does not meet the password policy.');
  }
  if (!/^\d{6}$/.test(pin)) {
    throw new Error('SEED_ADMIN_PIN must contain exactly six digits.');
  }
  if (Buffer.byteLength(pinPepper, 'utf8') < 32) {
    throw new Error('PIN_PEPPER must contain at least 32 bytes.');
  }

  const [passwordHash, pinHash] = await Promise.all([
    hashCredential(password),
    hashCredential(pin),
  ]);
  const pinLookup = createPinLookup(pin, pinPepper);

  const adminUser = await prisma.user.upsert({
    where: { username },
    update: {
      email,
      passwordHash,
      pinHash,
      pinLookup,
      role: 'ADMIN',
      isActive: true,
      failedLoginAttempts: 0,
      lockoutLevel: 0,
      lockedUntil: null,
      tokenVersion: { increment: 1 },
    },
    create: {
      username,
      email,
      firstName: 'Admin',
      lastName: 'General',
      pinHash,
      pinLookup,
      passwordHash,
      role: 'ADMIN',
      isActive: true,
      failedLoginAttempts: 0,
    },
  });

  console.log(`Admin user created/rotated: ${adminUser.username}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
