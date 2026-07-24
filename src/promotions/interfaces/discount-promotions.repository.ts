import type {
  CuponDiscountType,
  DiscountCategory,
  DiscountProduct,
  DiscountPromotion,
  PromoActiveStatus,
} from '@prisma/client';

export const DISCOUNT_PROMOTIONS_REPOSITORY = Symbol(
  'DISCOUNT_PROMOTIONS_REPOSITORY',
);

export type DiscountWithRelations = DiscountPromotion & {
  products: DiscountProduct[];
  categories: DiscountCategory[];
};

export interface CreateDiscountPromotionData {
  name: string;
  discountType: CuponDiscountType;
  discountValue: number;
  status: PromoActiveStatus;
  productIds?: string[];
  categoryIds?: string[];
}

export type UpdateDiscountPromotionData = Partial<CreateDiscountPromotionData>;

export interface IDiscountPromotionsRepository {
  list(): Promise<DiscountWithRelations[]>;
  findById(id: number): Promise<DiscountWithRelations | null>;
  create(data: CreateDiscountPromotionData): Promise<DiscountWithRelations>;
  update(
    id: number,
    data: UpdateDiscountPromotionData,
  ): Promise<DiscountWithRelations>;
  delete(id: number): Promise<void>;
}
