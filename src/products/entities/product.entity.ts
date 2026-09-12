export type ProductSize = string;

export interface ProductPriceEntity {
  size: ProductSize;
  price: number;
}

export interface ExtraIngredientEntity {
  name: string;
  prices: ProductPriceEntity[];
}

export interface ComboGroupOptionEntity {
  id?: string;
  itemProductId: string;
  itemProductName?: string;
  size?: string;
  extraPrice: number;
}

export interface ComboGroupEntity {
  id?: string;
  name: string;
  requiredCount: number;
  options: ComboGroupOptionEntity[];
}

export interface ProductEntity {
  id: string;
  categoryId: string;
  name: string;
  description?: string;
  isActive: boolean;
  hasMultipleSizes: boolean;
  isCombo?: boolean;
  comboPrice?: number;
  prices: ProductPriceEntity[];
  extras?: ExtraIngredientEntity[];
  comboGroups?: ComboGroupEntity[];
}
