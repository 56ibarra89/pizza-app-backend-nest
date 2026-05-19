import { IsOptional, IsString } from 'class-validator';

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  icon?: string;
}
