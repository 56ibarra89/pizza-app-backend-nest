import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createPinLookup,
  hashCredential,
  verifyCredential,
} from './credential-hasher';
import { requireSecuritySecret } from './security-config';

@Injectable()
export class PinHasherService {
  private readonly pepper: string;

  constructor(config: ConfigService) {
    this.pepper = requireSecuritySecret(config, 'PIN_PEPPER');
  }

  lookup(pin: string): string {
    return createPinLookup(pin, this.pepper);
  }

  hash(pin: string): Promise<string> {
    return hashCredential(pin);
  }

  verify(pin: string, storedHash: string): Promise<boolean> {
    return verifyCredential(pin, storedHash);
  }

  async consumeVerificationTime(pin: string): Promise<void> {
    await hashCredential(pin);
  }
}
