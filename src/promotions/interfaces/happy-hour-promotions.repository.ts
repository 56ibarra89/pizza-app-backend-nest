import type {
  HappyHourCategory,
  HappyHourProduct,
  HappyHourPromotion,
  HappyHourPromotionType,
  PromoActiveStatus,
  WeekDay,
} from '@prisma/client';

export const HAPPY_HOUR_PROMOTIONS_REPOSITORY = Symbol(
  'HAPPY_HOUR_PROMOTIONS_REPOSITORY',
);

export type HappyHourWithRelations = HappyHourPromotion & {
  products: HappyHourProduct[];
  categories: HappyHourCategory[];
};

export interface CreateHappyHourPromotionData {
  name: string;
  daysOfWeek: WeekDay[];
  startMinutes: number;
  endMinutes: number;
  promotionType: HappyHourPromotionType;
  promotionValue: number | null;
  status: PromoActiveStatus;
  appliesTo: string | null;
  productIds?: string[];
  categoryIds?: string[];
}

export type UpdateHappyHourPromotionData =
  Partial<CreateHappyHourPromotionData>;

export interface IHappyHourPromotionsRepository {
  list(): Promise<HappyHourWithRelations[]>;
  findById(id: number): Promise<HappyHourWithRelations | null>;
  create(data: CreateHappyHourPromotionData): Promise<HappyHourWithRelations>;
  update(
    id: number,
    data: UpdateHappyHourPromotionData,
  ): Promise<HappyHourWithRelations>;
  delete(id: number): Promise<void>;
}
