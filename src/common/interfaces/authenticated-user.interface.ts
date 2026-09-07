import type { UserRoleDto } from '../enums/user-role.enum';

export interface AuthenticatedUser {
  id: string;
  username: string;
  role: UserRoleDto;
  firstName?: string;
  lastName?: string;
}
