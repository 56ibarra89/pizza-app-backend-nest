import type { DiscountWithRelations } from '../../promotions/interfaces/discount-promotions.repository';
import type { HappyHourWithRelations } from '../../promotions/interfaces/happy-hour-promotions.repository';

export type OrderPromotionSource =
  | 'none'
  | 'coupon'
  | 'discount'
  | 'happy-hour';

export interface OrderPromotionInput {
  promotionSource?: OrderPromotionSource;
  promotionCode?: string;
  cuponId?: number;
  discountId?: number;
  happyHourId?: number;
}

export type ResolvedOrderPromotion =
  | { source: 'none' }
  | { source: 'coupon'; cuponId: number; promotionCode?: string }
  | {
      source: 'discount';
      discountId: number;
      rule: DiscountWithRelations;
    }
  | {
      source: 'happy-hour';
      happyHourId: number;
      rule: HappyHourWithRelations;
    };
