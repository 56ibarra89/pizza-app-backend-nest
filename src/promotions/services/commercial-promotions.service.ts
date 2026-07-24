import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CuponDiscountType } from '@prisma/client';
import type { CreateDiscountDto } from '../dto/discounts/create-discount.dto';
import type { UpdateDiscountDto } from '../dto/discounts/update-discount.dto';
import type { CreateHappyHourDto } from '../dto/happy-hours/create-happy-hour.dto';
import type { UpdateHappyHourDto } from '../dto/happy-hours/update-happy-hour.dto';
import {
  DISCOUNT_PROMOTIONS_REPOSITORY,
  type DiscountWithRelations,
  type IDiscountPromotionsRepository,
} from '../interfaces/discount-promotions.repository';
import {
  HAPPY_HOUR_PROMOTIONS_REPOSITORY,
  type HappyHourWithRelations,
  type IHappyHourPromotionsRepository,
} from '../interfaces/happy-hour-promotions.repository';
import {
  buildHappyHourDerivedFields,
  decimalToNumber,
  fromDbDiscountType,
  fromDbHappyHourPromotionType,
  fromDbPromoActiveStatus,
  minutesToTime,
  timeToMinutes,
  toDbDiscountType,
  toDbHappyHourPromotionType,
  toDbPromoActiveStatus,
} from '../mappers/promotions.mapper';

@Injectable()
export class CommercialPromotionsService {
  constructor(
    @Inject(HAPPY_HOUR_PROMOTIONS_REPOSITORY)
    private readonly happyHoursRepository: IHappyHourPromotionsRepository,
    @Inject(DISCOUNT_PROMOTIONS_REPOSITORY)
    private readonly discountsRepository: IDiscountPromotionsRepository,
  ) {}

  async listHappyHours() {
    const happyHours = await this.happyHoursRepository.list();
    return happyHours.map((happyHour) => this.mapHappyHour(happyHour));
  }

  async createHappyHour(dto: CreateHappyHourDto) {
    const startMinutes = timeToMinutes(dto.startTime);
    const endMinutes = timeToMinutes(dto.endTime);
    this.validateHappyHourTimes(startMinutes, endMinutes);

    const created = await this.happyHoursRepository.create({
      name: dto.name,
      daysOfWeek: dto.daysOfWeek,
      startMinutes,
      endMinutes,
      promotionType: toDbHappyHourPromotionType(dto.promotionType),
      promotionValue:
        dto.promotionType === '2x1' ? null : (dto.promotionValue ?? null),
      status: toDbPromoActiveStatus(dto.status ?? 'Activo'),
      appliesTo: dto.promotionType === '2x1' ? (dto.appliesTo ?? null) : null,
      productIds: dto.productIds,
      categoryIds: dto.categoryIds,
    });

    return this.mapHappyHour(created);
  }

  async updateHappyHour(id: number, dto: UpdateHappyHourDto) {
    const existing = await this.happyHoursRepository.findById(id);
    if (!existing) {
      throw new NotFoundException('Regla Happy Hour no encontrada');
    }

    const nextPromotionType =
      dto.promotionType ?? fromDbHappyHourPromotionType(existing.promotionType);
    const nextStartMinutes =
      dto.startTime !== undefined
        ? timeToMinutes(dto.startTime)
        : existing.startMinutes;
    const nextEndMinutes =
      dto.endTime !== undefined
        ? timeToMinutes(dto.endTime)
        : existing.endMinutes;
    this.validateHappyHourTimes(nextStartMinutes, nextEndMinutes);

    const updated = await this.happyHoursRepository.update(id, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.daysOfWeek !== undefined ? { daysOfWeek: dto.daysOfWeek } : {}),
      ...(dto.startTime !== undefined
        ? { startMinutes: nextStartMinutes }
        : {}),
      ...(dto.endTime !== undefined ? { endMinutes: nextEndMinutes } : {}),
      ...(dto.promotionType !== undefined
        ? {
            promotionType: toDbHappyHourPromotionType(dto.promotionType),
          }
        : {}),
      ...(dto.status !== undefined
        ? { status: toDbPromoActiveStatus(dto.status) }
        : {}),
      ...(dto.promotionValue !== undefined
        ? {
            promotionValue:
              nextPromotionType === '2x1' ? null : dto.promotionValue,
          }
        : {}),
      ...(dto.appliesTo !== undefined
        ? {
            appliesTo: nextPromotionType === '2x1' ? dto.appliesTo : null,
          }
        : {}),
      ...(dto.productIds !== undefined ? { productIds: dto.productIds } : {}),
      ...(dto.categoryIds !== undefined
        ? { categoryIds: dto.categoryIds }
        : {}),
    });

    return this.mapHappyHour(updated);
  }

  async deleteHappyHour(id: number): Promise<void> {
    const existing = await this.happyHoursRepository.findById(id);
    if (!existing) return;

    await this.happyHoursRepository.delete(id);
  }

  async listDiscounts() {
    const discounts = await this.discountsRepository.list();
    return discounts.map((discount) => this.mapDiscount(discount));
  }

  async createDiscount(dto: CreateDiscountDto) {
    const discountType = this.parseDiscountType(dto.type);
    this.validateDiscountValue(discountType, dto.value);

    const created = await this.discountsRepository.create({
      name: dto.name,
      discountType: toDbDiscountType(discountType),
      discountValue: dto.value,
      status: toDbPromoActiveStatus(dto.status ?? 'Activo'),
      productIds: dto.productIds,
      categoryIds: dto.categoryIds,
    });

    return this.mapDiscount(created);
  }

  async updateDiscount(id: number, dto: UpdateDiscountDto) {
    const existing = await this.discountsRepository.findById(id);
    if (!existing) throw new NotFoundException('Descuento no encontrado');

    const nextType = dto.type
      ? this.parseDiscountType(dto.type)
      : fromDbDiscountType(existing.discountType);
    const nextValue = dto.value ?? decimalToNumber(existing.discountValue);
    this.validateDiscountValue(nextType, nextValue);

    const updated = await this.discountsRepository.update(id, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.type !== undefined
        ? { discountType: toDbDiscountType(nextType) }
        : {}),
      ...(dto.value !== undefined ? { discountValue: nextValue } : {}),
      ...(dto.status !== undefined
        ? { status: toDbPromoActiveStatus(dto.status) }
        : {}),
      ...(dto.productIds !== undefined ? { productIds: dto.productIds } : {}),
      ...(dto.categoryIds !== undefined
        ? { categoryIds: dto.categoryIds }
        : {}),
    });

    return this.mapDiscount(updated);
  }

  async deleteDiscount(id: number): Promise<void> {
    const existing = await this.discountsRepository.findById(id);
    if (!existing) return;

    await this.discountsRepository.delete(id);
  }

  private mapHappyHour(happyHour: HappyHourWithRelations) {
    const promotionType = fromDbHappyHourPromotionType(happyHour.promotionType);
    const promotionValue = decimalToNumber(happyHour.promotionValue);
    const derived = buildHappyHourDerivedFields({
      daysOfWeek: happyHour.daysOfWeek,
      startMinutes: happyHour.startMinutes,
      endMinutes: happyHour.endMinutes,
      promotionType,
      promotionValue: happyHour.promotionValue ? promotionValue : null,
      appliesTo: happyHour.appliesTo,
    });

    return {
      id: happyHour.id,
      name: happyHour.name,
      daysOfWeek: happyHour.daysOfWeek,
      startTime: minutesToTime(happyHour.startMinutes),
      endTime: minutesToTime(happyHour.endMinutes),
      promotionType,
      promotionValue: happyHour.promotionValue ? promotionValue : null,
      status: fromDbPromoActiveStatus(happyHour.status),
      appliesTo: happyHour.appliesTo ?? undefined,
      productIds: happyHour.products.map((product) => product.productId),
      categoryIds: happyHour.categories.map((category) => category.categoryId),
      ...derived,
    };
  }

  private mapDiscount(discount: DiscountWithRelations) {
    const discountValue = decimalToNumber(discount.discountValue);

    return {
      id: discount.id,
      name: discount.name,
      type:
        discount.discountType === CuponDiscountType.PORCENTAJE
          ? 'Porcentaje'
          : 'Monto Fijo',
      value:
        discount.discountType === CuponDiscountType.PORCENTAJE
          ? `${discountValue}%`
          : `C$${discountValue.toFixed(2)}`,
      discountValue,
      status: fromDbPromoActiveStatus(discount.status),
      productIds: discount.products.map((product) => product.productId),
      categoryIds: discount.categories.map((category) => category.categoryId),
    };
  }

  private validateHappyHourTimes(
    startMinutes: number,
    endMinutes: number,
  ): void {
    if (startMinutes < 0 || startMinutes > 1440) {
      throw new BadRequestException('Minutos de inicio inválidos (0-1440)');
    }
    if (endMinutes < 0 || endMinutes > 1440) {
      throw new BadRequestException('Minutos de fin inválidos (0-1440)');
    }
    if (endMinutes < startMinutes) {
      throw new BadRequestException(
        'La hora de fin no puede ser anterior a la hora de inicio',
      );
    }
  }

  private parseDiscountType(type: string): 'porcentaje' | 'monto_fijo' {
    return type.trim().toLowerCase() === 'porcentaje'
      ? 'porcentaje'
      : 'monto_fijo';
  }

  private validateDiscountValue(
    discountType: 'porcentaje' | 'monto_fijo',
    value: number,
  ): void {
    if (value <= 0) {
      throw new BadRequestException('Valor de descuento inválido');
    }
    if (discountType === 'porcentaje' && value > 100) {
      throw new BadRequestException('El porcentaje no puede superar 100');
    }
  }
}
