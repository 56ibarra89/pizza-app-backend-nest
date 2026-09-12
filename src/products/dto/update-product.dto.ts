import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { ExtraIngredientDto } from './extra-ingredient.dto';
import { ProductPriceDto } from './product-price.dto';
import { ComboGroupDto } from './combo-group.dto';

export class UpdateProductDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsString()
  name?: string;

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

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ProductPriceDto)
  prices?: ProductPriceDto[];

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
