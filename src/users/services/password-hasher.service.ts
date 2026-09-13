import { Injectable } from '@nestjs/common';
import {
  hashCredential,
  verifyCredential,
} from '../../common/security/credential-hasher';

@Injectable()
export class PasswordHasherService {
  async hash(password: string): Promise<string> {
    return hashCredential(password);
  }

  async verify(password: string, stored: string): Promise<boolean> {
    return verifyCredential(password, stored);
  }
}
