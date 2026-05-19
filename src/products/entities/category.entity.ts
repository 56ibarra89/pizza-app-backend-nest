import type { ProductEntity } from './product.entity';

export interface CategoryEntity {
  id: string;
  label: string;
  icon?: string;
  items: ProductEntity[];
}
