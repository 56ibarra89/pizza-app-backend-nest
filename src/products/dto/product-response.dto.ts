import type { ProductPriceDto } from './product-price.dto';
import type { ExtraIngredientDto } from './extra-ingredient.dto';

export interface ProductResponseDto {
  id: string;
  categoryId: string;
  name: string;
  description?: string;
  hasMultipleSizes: boolean;
  prices: ProductPriceDto[];
  extras?: ExtraIngredientDto[];
}
