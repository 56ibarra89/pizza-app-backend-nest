import { UserRole as DbUserRole } from '@prisma/client';
import { UserRoleDto } from '../dto/user-role.dto';

export function toDbRole(role: UserRoleDto): DbUserRole {
  switch (role) {
    case UserRoleDto.admin:
      return DbUserRole.ADMIN;
    case UserRoleDto.cajero:
      return DbUserRole.CAJERO;
    case UserRoleDto.mesero:
      return DbUserRole.MESERO;
    case UserRoleDto.cocinero:
      return DbUserRole.COCINERO;
    default:
      throw new Error(`Unsupported UserRoleDto: ${String(role)}`);
  }
}

export function fromDbRole(role: DbUserRole): UserRoleDto {
  switch (role) {
    case DbUserRole.ADMIN:
      return UserRoleDto.admin;
    case DbUserRole.CAJERO:
      return UserRoleDto.cajero;
    case DbUserRole.MESERO:
      return UserRoleDto.mesero;
    case DbUserRole.COCINERO:
      return UserRoleDto.cocinero;
    default:
      throw new Error(`Unsupported DbUserRole: ${String(role)}`);
  }
}
