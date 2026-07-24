import type {
  Cupon,
  CuponDiscountType,
  CuponManualStatus,
} from '@prisma/client';

export const COUPON_PROMOTIONS_REPOSITORY = Symbol(
  'COUPON_PROMOTIONS_REPOSITORY',
);

export interface CreateCouponPromotionData {
  code: string;
  discountType: CuponDiscountType;
  discountValue: number;
  maxUses: number;
  currentUses: number;
  expiresDate: Date | null;
  manualStatus: CuponManualStatus;
}

export type UpdateCouponPromotionData = Partial<CreateCouponPromotionData>;

export interface ICouponPromotionsRepository {
  list(): Promise<Cupon[]>;
  findById(id: number): Promise<Cupon | null>;
  findByCode(code: string): Promise<Cupon | null>;
  create(data: CreateCouponPromotionData): Promise<Cupon>;
  update(id: number, data: UpdateCouponPromotionData): Promise<Cupon>;
  delete(id: number): Promise<void>;
}
