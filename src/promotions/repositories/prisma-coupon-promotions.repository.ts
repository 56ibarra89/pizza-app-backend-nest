import { Injectable } from '@nestjs/common';
import type { Cupon } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  CreateCouponPromotionData,
  ICouponPromotionsRepository,
  UpdateCouponPromotionData,
} from '../interfaces/coupon-promotions.repository';

@Injectable()
export class PrismaCouponPromotionsRepository implements ICouponPromotionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(): Promise<Cupon[]> {
    return this.prisma.cupon.findMany({
      where: { deletedAt: null },
      orderBy: { id: 'asc' },
    });
  }

  findById(id: number): Promise<Cupon | null> {
    return this.prisma.cupon.findFirst({
      where: { id, deletedAt: null },
    });
  }

  findByCode(code: string): Promise<Cupon | null> {
    return this.prisma.cupon.findFirst({
      where: { code, deletedAt: null },
    });
  }

  create(data: CreateCouponPromotionData): Promise<Cupon> {
    return this.prisma.cupon.create({ data });
  }

  update(id: number, data: UpdateCouponPromotionData): Promise<Cupon> {
    return this.prisma.cupon.update({ where: { id }, data });
  }

  async delete(id: number): Promise<void> {
    await this.prisma.cupon.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
