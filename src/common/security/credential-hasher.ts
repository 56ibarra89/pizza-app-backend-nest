import {
  createHmac,
  randomBytes,
  scrypt as nodeScrypt,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(nodeScrypt);
const KEY_LENGTH = 64;

export async function hashCredential(value: string): Promise<string> {
  const salt = randomBytes(16);
  const derivedKey = (await scrypt(value, salt, KEY_LENGTH)) as Buffer;
  return `scrypt$${salt.toString('base64')}$${derivedKey.toString('base64')}`;
}

export async function verifyCredential(
  value: string,
  stored: string,
): Promise<boolean> {
  try {
    const [algorithm, saltBase64, hashBase64] = stored.split('$');
    if (algorithm !== 'scrypt' || !saltBase64 || !hashBase64) return false;

    const salt = Buffer.from(saltBase64, 'base64');
    const expected = Buffer.from(hashBase64, 'base64');
    if (salt.length !== 16 || expected.length !== KEY_LENGTH) return false;

    const actual = (await scrypt(value, salt, expected.length)) as Buffer;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function createPinLookup(pin: string, pepper: string): string {
  return createHmac('sha256', pepper).update(pin, 'utf8').digest('base64url');
}
