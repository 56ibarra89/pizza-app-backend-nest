import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { UserRoleDto } from '../../common';

function trimText(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateAccessRoleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  @Transform(({ value }) => trimText(value as unknown))
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  @Transform(({ value }) => trimText(value as unknown))
  description?: string;

  @IsEnum(UserRoleDto)
  baseRole!: UserRoleDto;

  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  permissionCodes!: string[];
}
