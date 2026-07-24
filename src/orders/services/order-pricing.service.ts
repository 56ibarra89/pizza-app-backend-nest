import { BadRequestException, Injectable } from '@nestjs/common';
import { AppConfigService } from '../../app-config/services/app-config.service';
import { ProductsService } from '../../products/services/products.service';
import { CouponPromotionsService } from '../../promotions/services/coupon-promotions.service';
import type { CartItemEntity } from '../entities/order-item.entity';
import type { OrderTotals } from '../types/order-totals';

interface PackagingSizeConfig {
  name: string;
  price: number;
}

interface TaxConfig {
  isExonerated: boolean;
  taxes: Array<{ percentage: number }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== 'string') return null;

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readPackagingSizes(value: unknown): PackagingSizeConfig[] {
  if (!isRecord(value) || !Array.isArray(value.sizes)) return [];

  return value.sizes.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    if (typeof entry.name !== 'string') return [];

    const price = readNumber(entry.price);

    return price === null ? [] : [{ name: entry.name, price }];
  });
}

function readTaxConfig(value: unknown): TaxConfig {
  if (!isRecord(value) || Object.keys(value).length === 0) {
    return {
      taxes: [{ percentage: 15 }],
      isExonerated: false,
    };
  }

  const taxes = Array.isArray(value.taxes)
    ? value.taxes.flatMap((entry) => {
        if (!isRecord(entry)) return [];
        const percentage = readNumber(entry.percentage);
        return percentage === null ? [] : [{ percentage }];
      })
    : [];

  return {
    taxes,
    isExonerated: value.isExonerated === true,
  };
}

@Injectable()
export class OrderPricingService {
  constructor(
    private readonly productsService: ProductsService,
    private readonly appConfigService: AppConfigService,
    private readonly coupons: CouponPromotionsService,
  ) {}

  async resolveCouponId(
    cuponId?: number,
    promotionCode?: string,
  ): Promise<number | undefined> {
    if (cuponId !== undefined) return cuponId;
    if (!promotionCode?.trim()) return undefined;

    const coupon = await this.coupons.findByCode(promotionCode);
    if (!coupon) {
      throw new BadRequestException('Cupón no encontrado');
    }
    return coupon.id;
  }

  async calculate(
    items: readonly CartItemEntity[],
    cuponId?: number,
    providedDiscountAmount = 0,
  ): Promise<OrderTotals> {
    const packagingConfig =
      await this.appConfigService.getByIdOrDefault('packaging_sizes');
    const packagingSizes = readPackagingSizes(packagingConfig.data);

    let subTotal = 0;
    let discountableSubTotal = 0;

    for (const item of items) {
      const pricedItem = await this.resolveItemPrice(item, packagingSizes);
      const billableQuantity = Math.max(
        0,
        item.quantity - (item.giftQuantity || 0),
      );
      const itemTotal = pricedItem.unitPrice * billableQuantity;

      subTotal += itemTotal;
      if (pricedItem.isDiscountable) {
        discountableSubTotal += itemTotal;
      }
    }

    let discountAmount = Math.max(0, providedDiscountAmount);
    if (cuponId !== undefined) {
      const cupon = await this.coupons.findById(cuponId);
      if (!cupon) {
        throw new BadRequestException('Cupón no encontrado');
      }
      if (
        cupon.status !== 'Activo' ||
        (cupon.maxUses > 0 && cupon.currentUses >= cupon.maxUses)
      ) {
        throw new BadRequestException(`Cupón no válido: ${cupon.status}`);
      }

      discountAmount =
        cupon.discountType === 'porcentaje'
          ? discountableSubTotal * (cupon.discountValue / 100)
          : cupon.discountValue;
    }

    discountAmount = Math.min(discountAmount, subTotal);
    const taxableTotal = subTotal - discountAmount;

    const taxConfig = await this.appConfigService.getByIdOrDefault(
      'app_factura_tax_config',
    );
    const { taxes, isExonerated } = readTaxConfig(taxConfig.data);
    const taxPercentage = isExonerated ? 0 : (taxes[0]?.percentage ?? 0);
    const taxAmount =
      taxPercentage > 0 ? taxableTotal * (taxPercentage / 100) : 0;

    return {
      subTotal,
      discountAmount,
      taxAmount,
      total: Math.max(0, taxableTotal + taxAmount),
    };
  }

  private async resolveItemPrice(
    item: CartItemEntity,
    packagingSizes: readonly PackagingSizeConfig[],
  ): Promise<{ unitPrice: number; isDiscountable: boolean }> {
    if (item.productId) {
      const product = await this.productsService.getProductById(item.productId);
      const price = product.prices.find(
        (candidate) => candidate.size.toLowerCase() === item.size.toLowerCase(),
      );
      let unitPrice = price?.price ?? item.price;

      for (const selectedExtra of item.extras ?? []) {
        const extra = product.extras?.find(
          (candidate) =>
            candidate.name.toLowerCase() === selectedExtra.name.toLowerCase(),
        );
        const extraPrice = extra?.prices.find(
          (candidate) =>
            candidate.size.toLowerCase() === item.size.toLowerCase(),
        );
        unitPrice += extraPrice?.price ?? 0;
      }

      return { unitPrice, isDiscountable: true };
    }

    const normalizedName = item.name.toLowerCase();
    if (normalizedName.startsWith('empaque')) {
      const packagingName = item.name.replace(/empaque\s+/i, '').trim();
      const packaging = packagingSizes.find(
        (candidate) =>
          candidate.name.toLowerCase() === packagingName.toLowerCase(),
      );
      return {
        unitPrice: packaging?.price ?? item.price,
        isDiscountable: false,
      };
    }

    if (normalizedName === 'delivery') {
      return { unitPrice: item.price, isDiscountable: false };
    }

    return { unitPrice: item.price, isDiscountable: true };
  }
}
