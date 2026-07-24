import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  CreateDiscountPromotionData,
  DiscountWithRelations,
  IDiscountPromotionsRepository,
  UpdateDiscountPromotionData,
} from '../interfaces/discount-promotions.repository';

@Injectable()
export class PrismaDiscountPromotionsRepository implements IDiscountPromotionsRepository {
  private readonly includeRelations = {
    products: true,
    categories: true,
  } as const;

  constructor(private readonly prisma: PrismaService) {}

  list(): Promise<DiscountWithRelations[]> {
    return this.prisma.discountPromotion.findMany({
      where: { deletedAt: null },
      orderBy: { id: 'asc' },
      include: this.includeRelations,
    });
  }

  findById(id: number): Promise<DiscountWithRelations | null> {
    return this.prisma.discountPromotion.findFirst({
      where: { id, deletedAt: null },
      include: this.includeRelations,
    });
  }

  create(data: CreateDiscountPromotionData): Promise<DiscountWithRelations> {
    const { productIds, categoryIds, ...fields } = data;

    return this.prisma.discountPromotion.create({
      data: {
        ...fields,
        ...(productIds?.length
          ? {
              products: {
                create: productIds.map((productId) => ({ productId })),
              },
            }
          : {}),
        ...(categoryIds?.length
          ? {
              categories: {
                create: categoryIds.map((categoryId) => ({ categoryId })),
              },
            }
          : {}),
      },
      include: this.includeRelations,
    });
  }

  update(
    id: number,
    data: UpdateDiscountPromotionData,
  ): Promise<DiscountWithRelations> {
    const { productIds, categoryIds, ...fields } = data;

    return this.prisma.discountPromotion.update({
      where: { id },
      data: {
        ...fields,
        ...(productIds !== undefined
          ? {
              products: {
                deleteMany: {},
                create: productIds.map((productId) => ({ productId })),
              },
            }
          : {}),
        ...(categoryIds !== undefined
          ? {
              categories: {
                deleteMany: {},
                create: categoryIds.map((categoryId) => ({ categoryId })),
              },
            }
          : {}),
      },
      include: this.includeRelations,
    });
  }

  async delete(id: number): Promise<void> {
    await this.prisma.discountPromotion.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
