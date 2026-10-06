import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  CuponDiscountType,
  HappyHourPromotionType,
  PromoActiveStatus,
} from '@prisma/client';
import { AppConfigService } from '../../app-config/services/app-config.service';
import { ProductsService } from '../../products/services/products.service';
import {
  DISCOUNT_PROMOTIONS_REPOSITORY,
  type IDiscountPromotionsRepository,
} from '../../promotions/interfaces/discount-promotions.repository';
import {
  HAPPY_HOUR_PROMOTIONS_REPOSITORY,
  type IHappyHourPromotionsRepository,
} from '../../promotions/interfaces/happy-hour-promotions.repository';
import { CouponPromotionsService } from '../../promotions/services/coupon-promotions.service';
import type { CartItemEntity } from '../entities/order-item.entity';
import type { ProductEntity } from '../../products/entities/product.entity';
import type {
  OrderPromotionInput,
  OrderPromotionSource,
  ResolvedOrderPromotion,
} from '../types/order-promotion';
import type { OrderTotals } from '../types/order-totals';

interface PackagingSizeConfig {
  name: string;
  price: number;
}

interface TaxConfig {
  isExonerated: boolean;
  taxes: Array<{ percentage: number }>;
}

interface PricedItem {
  unitPrice: number;
  isDiscountable: boolean;
  productId?: string;
  categoryId?: string;
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
    @Inject(DISCOUNT_PROMOTIONS_REPOSITORY)
    private readonly discounts: IDiscountPromotionsRepository,
    @Inject(HAPPY_HOUR_PROMOTIONS_REPOSITORY)
    private readonly happyHours: IHappyHourPromotionsRepository,
  ) {}

  async normalizeComboItems(
    items: CartItemEntity[],
  ): Promise<CartItemEntity[]> {
    return Promise.all(
      items.map(async (item) => {
        if (!item.isCombo || !item.productId) return item;
        const combo = await this.productsService.getProductById(item.productId);
        if (!combo.isCombo) {
          throw new BadRequestException('El producto indicado no es un combo');
        }
        return {
          ...item,
          comboSelections: await this.normalizeComboSelections(
            combo,
            item.comboSelections ?? [],
          ),
        };
      }),
    );
  }

  async resolvePromotion(
    input: OrderPromotionInput,
    fallback?: OrderPromotionInput,
    now = new Date(),
  ): Promise<ResolvedOrderPromotion> {
    const promotionCode = input.promotionCode?.trim();
    const hasCoupon = input.cuponId !== undefined || Boolean(promotionCode);
    const hasDiscount = input.discountId !== undefined;
    const hasHappyHour = input.happyHourId !== undefined;
    const selectorCount = [hasCoupon, hasDiscount, hasHappyHour].filter(
      Boolean,
    ).length;

    let source: OrderPromotionSource | undefined = input.promotionSource;
    if (!source) {
      if (selectorCount > 1) {
        throw new BadRequestException(
          'Solo se puede aplicar una promociÃ³n por orden',
        );
      }
      if (hasCoupon) source = 'coupon';
      else if (hasDiscount) source = 'discount';
      else if (hasHappyHour) source = 'happy-hour';
      else if (fallback) return this.resolvePromotion(fallback, undefined, now);
      else source = 'none';
    }

    this.assertSelectionMatchesSource(source, {
      hasCoupon,
      hasDiscount,
      hasHappyHour,
    });

    if (source === 'none') return { source };

    if (source === 'coupon') {
      let cuponId = input.cuponId;
      if (promotionCode) {
        const coupon = await this.coupons.findByCode(promotionCode, now);
        if (!coupon) throw new BadRequestException('CupÃ³n no encontrado');
        if (cuponId !== undefined && cuponId !== coupon.id) {
          throw new BadRequestException(
            'El cÃ³digo de cupÃ³n no coincide con el cupÃ³n seleccionado',
          );
        }
        cuponId = coupon.id;
      }
      if (cuponId === undefined) {
        throw new BadRequestException('Debe indicar el cupÃ³n a aplicar');
      }
      return { source, cuponId, promotionCode };
    }

    if (source === 'discount') {
      if (input.discountId === undefined) {
        throw new BadRequestException('Debe indicar el descuento a aplicar');
      }
      const rule = await this.discounts.findById(input.discountId);
      if (!rule || rule.status !== PromoActiveStatus.ACTIVO) {
        throw new BadRequestException('El descuento no estÃ¡ activo');
      }
      return { source, discountId: rule.id, rule };
    }

    if (input.happyHourId === undefined) {
      throw new BadRequestException('Debe indicar la Hora Feliz a aplicar');
    }
    const rule = await this.happyHours.findById(input.happyHourId);
    if (!rule) {
      throw new BadRequestException('PromociÃ³n Hora Feliz no encontrada');
    }
    this.assertHappyHourIsActive(rule, now);
    return { source, happyHourId: rule.id, rule };
  }

  async calculate(
    items: readonly CartItemEntity[],
    promotion: ResolvedOrderPromotion = { source: 'none' },
  ): Promise<OrderTotals> {
    const packagingConfig =
      await this.appConfigService.getByIdOrDefault('packaging_sizes');
    const packagingSizes = readPackagingSizes(packagingConfig.data);

    let subTotal = 0;
    let eligibleSubTotal = 0;

    for (const item of items) {
      const pricedItem = await this.resolveItemPrice(item, packagingSizes);
      const isEligible = this.isPromotionEligible(item, pricedItem, promotion);
      const isTwoForOnePromotion =
        promotion.source === 'happy-hour' &&
        promotion.rule.promotionType === HappyHourPromotionType.DOSXUNO;

      if (item.giftReason === 'happy-hour-2x1' && !isTwoForOnePromotion) {
        throw new BadRequestException(
          `El regalo 2x1 de ${item.name} no tiene una Hora Feliz activa`,
        );
      }

      if (isTwoForOnePromotion && isEligible) {
        const expectedGiftQuantity = Math.floor(item.quantity / 2);
        if ((item.giftQuantity ?? 0) !== expectedGiftQuantity) {
          throw new BadRequestException(
            `La cantidad de regalo 2x1 no es vÃ¡lida para ${item.name}`,
          );
        }
      }

      const billableQuantity = Math.max(
        0,
        item.quantity - (item.giftQuantity || 0),
      );
      const itemTotal = pricedItem.unitPrice * billableQuantity;

      subTotal += itemTotal;
      if (pricedItem.isDiscountable && isEligible) {
        eligibleSubTotal += itemTotal;
      }
    }

    const discountAmount = await this.calculateDiscount(
      promotion,
      eligibleSubTotal,
    );
    const taxableTotal = Math.max(0, subTotal - discountAmount);

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

  private assertSelectionMatchesSource(
    source: OrderPromotionSource,
    selectors: {
      hasCoupon: boolean;
      hasDiscount: boolean;
      hasHappyHour: boolean;
    },
  ): void {
    const expectedSelector =
      source === 'coupon'
        ? selectors.hasCoupon
        : source === 'discount'
          ? selectors.hasDiscount
          : source === 'happy-hour'
            ? selectors.hasHappyHour
            : false;
    const selectorCount = [
      selectors.hasCoupon,
      selectors.hasDiscount,
      selectors.hasHappyHour,
    ].filter(Boolean).length;

    if (source === 'none' && selectorCount > 0) {
      throw new BadRequestException(
        'No se deben enviar datos de promociÃ³n cuando el origen es none',
      );
    }
    if (source !== 'none' && (!expectedSelector || selectorCount !== 1)) {
      throw new BadRequestException(
        'Los datos enviados no coinciden con el origen de la promociÃ³n',
      );
    }
  }

  private assertHappyHourIsActive(
    rule: Awaited<ReturnType<IHappyHourPromotionsRepository['findById']>> & {},
    now: Date,
  ): void {
    if (rule.status !== PromoActiveStatus.ACTIVO) {
      throw new BadRequestException('La promociÃ³n Hora Feliz no estÃ¡ activa');
    }

    const timeZone = process.env.BUSINESS_TIME_ZONE || 'America/Managua';
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    const parts = Object.fromEntries(
      formatter.formatToParts(now).map((part) => [part.type, part.value]),
    );
    const currentDay = parts.weekday?.toUpperCase();
    const currentMinutes =
      Number(parts.hour ?? 0) * 60 + Number(parts.minute ?? 0);

    if (
      !currentDay ||
      !rule.daysOfWeek.includes(
        currentDay as (typeof rule.daysOfWeek)[number],
      ) ||
      currentMinutes < rule.startMinutes ||
      currentMinutes > rule.endMinutes
    ) {
      throw new BadRequestException(
        'La promociÃ³n Hora Feliz no estÃ¡ disponible en este horario',
      );
    }
  }

  private async calculateDiscount(
    promotion: ResolvedOrderPromotion,
    eligibleSubTotal: number,
  ): Promise<number> {
    if (promotion.source === 'none') return 0;

    if (promotion.source === 'coupon') {
      const coupon = await this.coupons.findById(promotion.cuponId);
      if (!coupon) throw new BadRequestException('CupÃ³n no encontrado');
      if (
        coupon.status !== 'Activo' ||
        (coupon.maxUses > 0 && coupon.currentUses >= coupon.maxUses)
      ) {
        throw new BadRequestException(`CupÃ³n no vÃ¡lido: ${coupon.status}`);
      }

      const amount =
        coupon.discountType === 'porcentaje'
          ? eligibleSubTotal * (coupon.discountValue / 100)
          : coupon.discountValue;
      return Math.min(Math.max(0, amount), eligibleSubTotal);
    }

    if (promotion.source === 'discount') {
      const value = promotion.rule.discountValue.toNumber();
      const amount =
        promotion.rule.discountType === CuponDiscountType.PORCENTAJE
          ? eligibleSubTotal * (value / 100)
          : value;
      return Math.min(Math.max(0, amount), eligibleSubTotal);
    }

    if (promotion.rule.promotionType === HappyHourPromotionType.DOSXUNO) {
      return 0;
    }

    const value = promotion.rule.promotionValue?.toNumber() ?? 0;
    const amount =
      promotion.rule.promotionType === HappyHourPromotionType.PORCENTAJE
        ? eligibleSubTotal * (value / 100)
        : value;
    return Math.min(Math.max(0, amount), eligibleSubTotal);
  }

  private isPromotionEligible(
    item: CartItemEntity,
    pricedItem: PricedItem,
    promotion: ResolvedOrderPromotion,
  ): boolean {
    if (item.note?.startsWith('Vale: ')) return false;
    if (!pricedItem.isDiscountable || promotion.source === 'none') return false;
    if (promotion.source === 'coupon') return true;

    const productIds = promotion.rule.products.map(
      (product: { productId: string }) => product.productId,
    );
    const categoryIds = promotion.rule.categories.map(
      (category: { categoryId: string }) => category.categoryId,
    );

    if (productIds.length > 0 || categoryIds.length > 0) {
      return (
        (pricedItem.productId !== undefined &&
          productIds.includes(pricedItem.productId)) ||
        (pricedItem.categoryId !== undefined &&
          categoryIds.includes(pricedItem.categoryId))
      );
    }

    if (
      promotion.source === 'happy-hour' &&
      promotion.rule.promotionType === HappyHourPromotionType.DOSXUNO &&
      promotion.rule.appliesTo &&
      promotion.rule.appliesTo.toLowerCase() !== 'todos'
    ) {
      return item.name.toLowerCase() === promotion.rule.appliesTo.toLowerCase();
    }

    return true;
  }

  private async resolveItemPrice(
    item: CartItemEntity,
    packagingSizes: readonly PackagingSizeConfig[],
  ): Promise<PricedItem> {
    if (item.productId) {
      const product = await this.productsService.getProductById(item.productId);
      const price = product.prices.find(
        (candidate) => candidate.size.toLowerCase() === item.size.toLowerCase(),
      );
      let unitPrice = product.isCombo
        ? await this.resolveComboPrice(product, item)
        : (price?.price ?? item.price);

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

      return {
        unitPrice,
        isDiscountable: true,
        productId: product.id,
        categoryId: product.categoryId,
      };
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

  private async resolveComboPrice(
    combo: ProductEntity,
    item: CartItemEntity,
  ): Promise<number> {
    const selections = await this.normalizeComboSelections(
      combo,
      item.comboSelections ?? [],
    );
    const selectionsSurcharge = selections.reduce((total, selection) => {
      const extras = (selection.extras ?? []).reduce(
        (sum, extra) => sum + extra.price,
        0,
      );
      return total + (selection.extraPrice + extras) * selection.quantity;
    }, 0);
    return (
      Number(combo.comboPrice ?? combo.prices[0]?.price ?? 0) +
      selectionsSurcharge
    );
  }

  private async normalizeComboSelections(
    combo: ProductEntity,
    selections: NonNullable<CartItemEntity['comboSelections']>,
  ): Promise<NonNullable<CartItemEntity['comboSelections']>> {
    const groups = combo.comboGroups ?? [];
    const knownGroupIds = new Set(groups.map((group) => group.id));
    if (selections.some((selection) => !knownGroupIds.has(selection.groupId))) {
      throw new BadRequestException(
        'El combo contiene un grupo de selección inválido',
      );
    }

    const normalized = [] as NonNullable<CartItemEntity['comboSelections']>;
    for (const group of groups) {
      const groupSelections = selections.filter(
        (selection) => selection.groupId === group.id,
      );
      const selectedCount = groupSelections.reduce(
        (sum, selection) => sum + selection.quantity,
        0,
      );
      if (selectedCount !== group.requiredCount) {
        throw new BadRequestException(
          `El grupo ${group.name} requiere ${group.requiredCount} selección(es)`,
        );
      }

      for (const selection of groupSelections) {
        const option = group.options.find(
          (candidate) =>
            candidate.itemProductId === selection.productId &&
            (!candidate.size ||
              candidate.size.toLowerCase() === selection.size?.toLowerCase()),
        );
        if (!option) {
          throw new BadRequestException(
            `La opción ${selection.productName} no pertenece al grupo ${group.name}`,
          );
        }

        const component = await this.productsService.getProductById(
          selection.productId,
        );
        const selectedSize =
          selection.size ?? option.size ?? component.prices[0]?.size;
        if (!selectedSize) {
          throw new BadRequestException(
            `No se pudo determinar el tamaño de ${component.name}`,
          );
        }
        if (
          !component.prices.some(
            (price) => price.size.toLowerCase() === selectedSize.toLowerCase(),
          )
        ) {
          throw new BadRequestException(
            `El tamaño ${selectedSize} no está disponible para ${component.name}`,
          );
        }

        const requestedExtras = selection.extras ?? [];
        const requestedExtraNames = requestedExtras.map((extra) =>
          extra.name.trim().toLowerCase(),
        );
        if (new Set(requestedExtraNames).size !== requestedExtraNames.length) {
          throw new BadRequestException(
            `Hay extras duplicados para ${component.name}`,
          );
        }
        const extras = requestedExtras.map((requested) => {
          const extra = component.extras?.find(
            (candidate) =>
              candidate.name.toLowerCase() === requested.name.toLowerCase(),
          );
          const extraPrice = extra?.prices.find(
            (candidate) =>
              candidate.size.toLowerCase() === selectedSize.toLowerCase(),
          );
          if (!extra || !extraPrice) {
            throw new BadRequestException(
              `El extra ${requested.name} no está disponible para ${component.name}`,
            );
          }
          return { name: extra.name, price: extraPrice.price };
        });

        normalized.push({
          ...selection,
          groupName: group.name,
          productName: component.name,
          size: selection.size ?? option.size,
          extraPrice: option.extraPrice,
          categoryId: component.categoryId,
          extras,
        });
      }
    }

    return normalized;
  }
}
