import type { ExtraIngredientEntity, ProductEntity } from './product.entity';

export interface CategoryEntity {
  id: string;
  label: string;
  totalRevenue: number;
  icon?: string;
  kitchenId?: string;
  requiresPreparation?: boolean;
  extras: ExtraIngredientEntity[];
  items: ProductEntity[];
}
