import { IsBoolean, IsNotEmpty, IsOptional, IsString, ValidateIf } from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty()
  label!: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @ValidateIf((_, value) => value !== null)
  @IsOptional()
  @IsString()
  kitchenId?: string | null;

  @IsOptional()
  @IsBoolean()
  requiresPreparation?: boolean;
}
