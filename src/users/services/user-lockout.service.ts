import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { UserEntity } from '../entities/user.entity';

@Injectable()
export class UserLockoutService {
  assertCanAuthenticate(user: UserEntity) {
    if (user.lockedUntil) {
      if (new Date() < user.lockedUntil) {
        throw new UnauthorizedException(
          'Credenciales inválidas o acceso temporalmente bloqueado.',
        );
      }
    }
  }
}
