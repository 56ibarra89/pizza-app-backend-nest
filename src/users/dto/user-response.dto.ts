import type { UserRoleDto } from './user-role.dto';

export interface UserResponseDto {
  id: string;
  username: string;
  email?: string;
  firstName: string;
  lastName: string;
  pin?: string;
  role: UserRoleDto;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastVisit?: string;
  themePreference: string;
  workDays?: string[];
  extraDays?: { date: string; notes?: string }[];
}
