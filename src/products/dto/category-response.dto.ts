import type { ProductResponseDto } from './product-response.dto';

export interface CategoryResponseDto {
  id: string;
  label: string;
  icon?: string;
  items: ProductResponseDto[];
}
