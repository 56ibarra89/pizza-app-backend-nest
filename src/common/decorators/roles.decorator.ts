import { SetMetadata } from '@nestjs/common';
import { UserRoleDto } from '../../users/dto/user-role.dto';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRoleDto[]) => SetMetadata(ROLES_KEY, roles);
