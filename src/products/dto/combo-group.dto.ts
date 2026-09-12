import { Type } from 'class-transformer';
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  Min,
  IsOptional,
  IsArray,
  ValidateNested,
} from 'class-validator';

export class ComboGroupOptionDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @IsNotEmpty()
  itemProductId!: string;

  @IsOptional()
  @IsString()
  itemProductName?: string;

  @IsOptional()
  @IsString()
  size?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  extraPrice?: number;
}

export class ComboGroupDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  requiredCount!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ComboGroupOptionDto)
  options!: ComboGroupOptionDto[];
}
