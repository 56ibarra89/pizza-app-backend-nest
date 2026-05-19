import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty()
  label!: string;

  @IsOptional()
  @IsString()
  icon?: string;
}
