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
    case UserRoleDto.motorizado:
      return DbUserRole.MOTORIZADO;
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
    case DbUserRole.MOTORIZADO:
      return UserRoleDto.motorizado;
    default:
      throw new Error(`Unsupported DbUserRole: ${String(role)}`);
  }
}
