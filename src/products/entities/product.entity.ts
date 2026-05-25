export type ProductSize = 'familiar' | 'mediana' | 'personal' | 'único';

export interface ProductPriceEntity {
  size: ProductSize;
  price: number;
}

export interface ExtraIngredientEntity {
  name: string;
  prices: ProductPriceEntity[];
}

export interface ProductEntity {
  id: string;
  categoryId: string;
  name: string;
  description?: string;
  isActive: boolean;
  hasMultipleSizes: boolean;
  prices: ProductPriceEntity[];
  extras?: ExtraIngredientEntity[];
}
