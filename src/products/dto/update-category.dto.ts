import { IsNotEmpty, IsOptional, IsString, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  label?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @ValidateIf((_, value) => value !== null)
  @IsOptional()
  @IsString()
  kitchenId?: string | null;
}
