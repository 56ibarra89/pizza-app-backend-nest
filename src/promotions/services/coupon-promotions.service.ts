import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Cupon } from '@prisma/client';
import type { CreateCuponDto } from '../dto/cupones/create-cupon.dto';
import type { RedeemCuponDto } from '../dto/cupones/redeem-cupon.dto';
import type { UpdateCuponDto } from '../dto/cupones/update-cupon.dto';
import {
  COUPON_PROMOTIONS_REPOSITORY,
  type ICouponPromotionsRepository,
} from '../interfaces/coupon-promotions.repository';
import {
  decimalToNumber,
  fromDbCuponManualStatus,
  fromDbDiscountType,
  hydrateCuponDerivedFields,
  toDbCuponManualStatus,
  toDbDiscountType,
} from '../mappers/promotions.mapper';

@Injectable()
export class CouponPromotionsService {
  constructor(
    @Inject(COUPON_PROMOTIONS_REPOSITORY)
    private readonly repository: ICouponPromotionsRepository,
  ) {}

  async list(now = new Date()) {
    const coupons = await this.repository.list();
    return coupons.map((coupon) => this.mapResponse(coupon, now));
  }

  async findById(id: number, now = new Date()) {
    const coupon = await this.repository.findById(id);
    return coupon ? this.mapResponse(coupon, now) : null;
  }

  async findByCode(code: string, now = new Date()) {
    const coupon = await this.repository.findByCode(this.normalizeCode(code));
    return coupon ? this.mapResponse(coupon, now) : null;
  }

  async create(dto: CreateCuponDto) {
    const created = await this.repository.create({
      code: this.normalizeCode(dto.code),
      discountType: toDbDiscountType(dto.discountType),
      discountValue: dto.discountValue,
      maxUses: dto.maxUses ?? 0,
      currentUses: 0,
      expiresDate: dto.expiresDate ? new Date(dto.expiresDate) : null,
      manualStatus: toDbCuponManualStatus(dto.manualStatus ?? 'Activo'),
    });

    return this.mapResponse(created);
  }

  async update(id: number, dto: UpdateCuponDto) {
    const existing = await this.repository.findById(id);
    if (!existing) throw new NotFoundException('Cupón no encontrado');

    const updated = await this.repository.update(id, {
      ...(dto.code !== undefined ? { code: this.normalizeCode(dto.code) } : {}),
      ...(dto.discountType !== undefined
        ? { discountType: toDbDiscountType(dto.discountType) }
        : {}),
      ...(dto.discountValue !== undefined
        ? { discountValue: dto.discountValue }
        : {}),
      ...(dto.maxUses !== undefined ? { maxUses: dto.maxUses } : {}),
      ...(dto.currentUses !== undefined
        ? { currentUses: dto.currentUses }
        : {}),
      ...(dto.expiresDate !== undefined
        ? {
            expiresDate: dto.expiresDate ? new Date(dto.expiresDate) : null,
          }
        : {}),
      ...(dto.manualStatus !== undefined
        ? { manualStatus: toDbCuponManualStatus(dto.manualStatus) }
        : {}),
    });

    return this.mapResponse(updated);
  }

  async delete(id: number): Promise<void> {
    const existing = await this.repository.findById(id);
    if (!existing) return;

    await this.repository.delete(id);
  }

  async redeem(dto: RedeemCuponDto) {
    const coupon = await this.repository.findByCode(
      this.normalizeCode(dto.code),
    );
    if (!coupon) throw new NotFoundException('Cupón no encontrado');

    const mappedCoupon = this.mapResponse(coupon);
    if (mappedCoupon.status !== 'Activo') {
      throw new BadRequestException(`Cupón no válido: ${mappedCoupon.status}`);
    }

    await this.repository.update(coupon.id, {
      currentUses: coupon.currentUses + 1,
    });

    return {
      applied: {
        id: coupon.id,
        code: coupon.code,
        discountType: mappedCoupon.discountType,
        discountValue: mappedCoupon.discountValue,
      },
    };
  }

  private normalizeCode(code: string): string {
    return code.trim().toUpperCase();
  }

  private mapResponse(coupon: Cupon, now = new Date()) {
    const discountType = fromDbDiscountType(coupon.discountType);
    const manualStatus = fromDbCuponManualStatus(coupon.manualStatus);
    const discountValue = decimalToNumber(coupon.discountValue);
    const derived = hydrateCuponDerivedFields({
      discountType,
      discountValue,
      maxUses: coupon.maxUses,
      currentUses: coupon.currentUses,
      expiresDate: coupon.expiresDate,
      manualStatus,
      now,
    });

    return {
      id: coupon.id,
      code: coupon.code,
      discountType,
      discountValue,
      maxUses: coupon.maxUses,
      currentUses: coupon.currentUses,
      expiresDate: coupon.expiresDate
        ? coupon.expiresDate.toISOString().substring(0, 10)
        : null,
      ...derived,
    };
  }
}
