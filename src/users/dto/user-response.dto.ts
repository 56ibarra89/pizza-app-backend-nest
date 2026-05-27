import type { UserRoleDto } from './user-role.dto';

export interface UserResponseDto {
  id: string;
  username: string;
  email?: string;
  firstName: string;
  lastName: string;
  role: UserRoleDto;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastVisit?: string;
}
