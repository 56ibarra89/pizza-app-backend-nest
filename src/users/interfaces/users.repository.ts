import type { UserEntity } from '../entities/user.entity';
import type { UserRoleDto } from '../dto/user-role.dto';

export const USERS_REPOSITORY = Symbol('USERS_REPOSITORY');

export interface IUsersRepository {
  getAll(): Promise<UserEntity[]>;
  findById(id: string): Promise<UserEntity | null>;
  findByUsername(username: string): Promise<UserEntity | null>;
  findByEmail(email: string): Promise<UserEntity | null>;
  findByPin(pin: string): Promise<UserEntity | null>;

  create(data: {
    username: string;
    email?: string;
    firstName: string;
    lastName: string;
    pin: string;
    passwordHash?: string;
    role: UserRoleDto;
    isActive: boolean;
  }): Promise<UserEntity>;

  update(id: string, data: {
    username?: string;
    email?: string | null;
    firstName?: string;
    lastName?: string;
    pin?: string;
    passwordHash?: string | null;
    role?: UserRoleDto;
    isActive?: boolean;
    failedLoginAttempts?: number;
    lockoutLevel?: number;
    lockedUntil?: Date | null;
    lastVisit?: Date | null;
    themePreference?: string;
    tokenVersion?: number;
  }): Promise<UserEntity>;

  delete(id: string): Promise<void>;
}
