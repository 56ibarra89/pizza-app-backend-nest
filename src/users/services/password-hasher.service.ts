import { Injectable } from '@nestjs/common';
import { randomBytes, scrypt as _scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(_scrypt);

@Injectable()
export class PasswordHasherService {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(16);
    const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
    return `scrypt$${salt.toString('base64')}$${derivedKey.toString('base64')}`;
  }

  async verify(password: string, stored: string): Promise<boolean> {
    try {
      const [algo, saltB64, hashB64] = stored.split('$');
      if (algo !== 'scrypt' || !saltB64 || !hashB64) return false;

      const salt = Buffer.from(saltB64, 'base64');
      const expected = Buffer.from(hashB64, 'base64');
      const actual = (await scrypt(password, salt, expected.length)) as Buffer;
      return timingSafeEqual(actual, expected);
    } catch {
      return false;
    }
  }
}
