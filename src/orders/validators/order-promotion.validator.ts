import type { ResolvedOrderPromotion } from '../types/order-promotion';
import { isSplitBillOrderItem } from './order-item-kind';

export interface StoredPromotionIds {
  cuponId?: number | null;
  discountId?: number | null;
  happyHourId?: number | null;
}

export interface OrderCountCapableClient {
  order?: {
    count?: (args: {
      where: {
        parentOrderId?: string;
        status?: 'PAID';
        cuponId?: number;
        couponConsumptionRecorded?: boolean;
      };
    }) => Promise<number>;
  };
}

/**
 * Compara si la promoción resuelta para la operación coincide exactamente con la
 * promoción persistida previamente en la orden.
 */
export function isSameStoredPromotion(
  stored: StoredPromotionIds,
  resolved: ResolvedOrderPromotion,
): boolean {
  if (typeof stored.cuponId === 'number') {
    return resolved.source === 'coupon' && resolved.cuponId === stored.cuponId;
  }
  if (typeof stored.discountId === 'number') {
    return (
      resolved.source === 'discount' &&
      resolved.discountId === stored.discountId
    );
  }
  if (typeof stored.happyHourId === 'number') {
    return (
      resolved.source === 'happy-hour' &&
      resolved.happyHourId === stored.happyHourId
    );
  }
  return resolved.source === 'none';
}

/**
 * Determina si una orden padre conserva un descuento parcial producto de una
 * división de cuenta sin que el cajero haya cambiado o retirado la promoción.
 */
export function isSplitDiscountAdjustmentCandidate(params: {
  hasSplitHistory: boolean;
  sameStoredPromotion: boolean;
  storedDiscountAmount?: number | null;
  promotion: ResolvedOrderPromotion;
  calculatedDiscountAmount: number;
}): boolean {
  if (!params.hasSplitHistory || !params.sameStoredPromotion) {
    return false;
  }
  if (
    typeof params.storedDiscountAmount !== 'number' ||
    params.storedDiscountAmount < 0
  ) {
    return false;
  }
  return (
    (params.promotion.source === 'none' && params.storedDiscountAmount > 0) ||
    (params.promotion.source !== 'none' &&
      params.storedDiscountAmount + 0.01 < params.calculatedDiscountAmount)
  );
}

/**
 * Consulta en la base si la orden tiene historial real de división de cuenta y
 * si algún cobro hijo ya registró el consumo del cupón activo.
 */
export async function getSplitFamilyState(
  db: OrderCountCapableClient,
  params: {
    orderId: string;
    items: readonly { name: string }[];
    cuponId?: number | null;
  },
): Promise<{
  hasSplitHistory: boolean;
  couponAlreadyConsumedBySplit: boolean;
}> {
  const hasSplitItems = params.items.some(isSplitBillOrderItem);
  const countFn = db.order?.count;

  let paidSplitChildrenCount = 0;
  if (!hasSplitItems && typeof countFn === 'function') {
    paidSplitChildrenCount = Number(
      (await countFn({
        where: {
          parentOrderId: params.orderId,
          status: 'PAID',
        },
      })) ?? 0,
    );
  }

  let couponAlreadyConsumedBySplit = false;
  if (typeof params.cuponId === 'number' && typeof countFn === 'function') {
    const recordedCount = Number(
      (await countFn({
        where: {
          parentOrderId: params.orderId,
          status: 'PAID',
          cuponId: params.cuponId,
          couponConsumptionRecorded: true,
        },
      })) ?? 0,
    );
    couponAlreadyConsumedBySplit = recordedCount > 0;
  }

  return {
    hasSplitHistory: hasSplitItems || paidSplitChildrenCount > 0,
    couponAlreadyConsumedBySplit,
  };
}
