import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { ExtraIngredientDto } from './extra-ingredient.dto';
import { ProductPriceDto } from './product-price.dto';
import { ComboGroupDto } from './combo-group.dto';

export class CreateProductDto {
  @IsUUID()
  categoryId!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  hasMultipleSizes?: boolean;

  @IsOptional()
  @IsBoolean()
  isCombo?: boolean;

  @IsOptional()
  @Type(() => Number)
  comboPrice?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ProductPriceDto)
  prices!: ProductPriceDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExtraIngredientDto)
  extras?: ExtraIngredientDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ComboGroupDto)
  comboGroups?: ComboGroupDto[];
}
