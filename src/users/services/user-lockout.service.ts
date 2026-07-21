import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { UserEntity } from '../entities/user.entity';

export type UserSecurityUpdate = {
  failedLoginAttempts?: number;
  lockoutLevel?: number;
  lockedUntil?: Date | null;
  lastVisit?: Date | null;
};

@Injectable()
export class UserLockoutService {
  assertCanAuthenticate(user: UserEntity) {
    if (user.lockedUntil) {
      if (new Date() < user.lockedUntil) {
        throw new UnauthorizedException(`Cuenta bloqueada temporalmente hasta ${user.lockedUntil.toLocaleString()}`);
      }

      if (user.lockoutLevel >= 4) {
        throw new UnauthorizedException('Cuenta suspendida. Contacte a un administrador.');
      }
    }
  }

  createFailedAttemptUpdate(user: UserEntity): UserSecurityUpdate {
    let newAttempts = user.failedLoginAttempts + 1;
    let newLevel = user.lockoutLevel;
    let newLockedUntil = user.lockedUntil;

    if (newAttempts >= 5) {
      newAttempts = 0;
      newLevel += 1;
      const now = new Date();

      if (newLevel === 1) {
        newLockedUntil = new Date(now.getTime() + 5 * 60000);
      } else if (newLevel === 2) {
        newLockedUntil = new Date(now.getTime() + 15 * 60000);
      } else if (newLevel === 3) {
        newLockedUntil = new Date(now.getTime() + 60 * 60000);
      } else {
        newLockedUntil = new Date(now.getTime() + 36500 * 24 * 60 * 60000);
      }
    }

    return {
      failedLoginAttempts: newAttempts,
      lockoutLevel: newLevel,
      lockedUntil: newLockedUntil,
    };
  }

  createSuccessfulAttemptUpdate(): UserSecurityUpdate {
    return {
      lastVisit: new Date(),
      failedLoginAttempts: 0,
      lockoutLevel: 0,
      lockedUntil: null,
    };
  }
}