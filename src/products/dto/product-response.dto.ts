import type { ProductPriceDto } from './product-price.dto';
import type { ExtraIngredientEntity } from '../entities/product.entity';

export interface ProductResponseDto {
  id: string;
  categoryId: string;
  name: string;
  description?: string;
  hasMultipleSizes: boolean;
  prices: ProductPriceDto[];
  extras?: ExtraIngredientEntity[];
}
