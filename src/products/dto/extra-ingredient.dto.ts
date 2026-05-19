import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsNotEmpty, IsString, ValidateNested } from 'class-validator';
import { ProductPriceDto } from './product-price.dto';

export class ExtraIngredientDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ProductPriceDto)
  prices!: ProductPriceDto[];
}
