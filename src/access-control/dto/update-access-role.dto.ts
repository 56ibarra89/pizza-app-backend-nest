import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

function trimText(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class UpdateAccessRoleDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Transform(({ value }) => trimText(value as unknown))
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  @Transform(({ value }) => trimText(value as unknown))
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  permissionCodes?: string[];
}
