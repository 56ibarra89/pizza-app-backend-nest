import { Transform, type TransformFnParams } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const STRONG_PASSWORD =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,128}$/;

function trimString({ value }: TransformFnParams): unknown {
  const input: unknown = value;
  return typeof input === 'string' ? input.trim() : input;
}

export class UpdateOwnProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  @Transform(trimString)
  username?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  @Transform(trimString)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Transform(trimString)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Transform(trimString)
  lastName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/, {
    message: 'El PIN debe contener exactamente 6 dígitos.',
  })
  pin?: string;

  @IsOptional()
  @IsString()
  @Matches(STRONG_PASSWORD, {
    message:
      'La contraseña debe tener de 8 a 128 caracteres, una mayúscula, una minúscula, un número y un carácter especial (@$!%*?&)',
  })
  password?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  currentPassword?: string;

  @IsOptional()
  @IsIn(['light', 'dark'])
  themePreference?: string;
}
