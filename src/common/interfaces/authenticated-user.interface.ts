import type { UserRoleDto } from '../enums/user-role.enum';

export interface AuthenticatedUser {
  id: string;
  username: string;
  role: UserRoleDto;
  accessRoleId?: string;
  accessRoleName?: string;
  permissions?: string[];
  firstName?: string;
  lastName?: string;
}
