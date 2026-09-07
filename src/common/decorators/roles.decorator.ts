import { SetMetadata } from '@nestjs/common';
import { UserRoleDto } from '../enums/user-role.enum';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRoleDto[]) => SetMetadata(ROLES_KEY, roles);
