import type { UserRoleDto } from '../../users/dto/user-role.dto';

export interface AuthenticatedUser {
  id: string;
  username: string;
  role: UserRoleDto;
  firstName?: string;
  lastName?: string;
}
