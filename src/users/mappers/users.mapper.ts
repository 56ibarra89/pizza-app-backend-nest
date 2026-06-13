import type { UserEntity } from '../entities/user.entity';
import type { UserResponseDto } from '../dto/user-response.dto';

export function toUserResponseDto(entity: UserEntity): UserResponseDto {
  return {
    id: entity.id,
    username: entity.username,
    email: entity.email,
    firstName: entity.firstName,
    lastName: entity.lastName,
    pin: entity.pin,
    role: entity.role,
    isActive: entity.isActive,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
    lastVisit: entity.lastVisit ? entity.lastVisit.toISOString() : undefined,
    themePreference: entity.themePreference,
    workDays: entity.workDays,
  };
}
