import type { UserRoleDto } from '../dto/user-role.dto';

export interface UserEntity {
  id: string;
  username: string;
  email?: string;
  firstName: string;
  lastName: string;
  pin: string;
  passwordHash?: string;
  role: UserRoleDto;
  isActive: boolean;
  failedLoginAttempts: number;
  lockoutLevel: number;
  lockedUntil?: Date;
  createdAt: Date;
  updatedAt: Date;
  lastVisit?: Date;
}
