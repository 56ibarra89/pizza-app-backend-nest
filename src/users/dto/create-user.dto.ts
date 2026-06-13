import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, Matches, IsArray } from 'class-validator';
import { UserRoleDto } from './user-role.dto';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  username!: string;

  @IsOptional()
  @IsEmail()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  email?: string;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  lastName!: string;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  pin!: string;

  @IsOptional()
  @IsString()
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/, {
    message: 'La contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula, un número y un carácter especial (@$!%*?&)'
  })
  @Transform(({ value }) => (typeof value === 'string' ? value : value))
  password?: string;

  @IsEnum(UserRoleDto)
  role!: UserRoleDto;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  workDays?: string[];
}
