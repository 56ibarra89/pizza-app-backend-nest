import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  CreateHappyHourPromotionData,
  HappyHourWithRelations,
  IHappyHourPromotionsRepository,
  UpdateHappyHourPromotionData,
} from '../interfaces/happy-hour-promotions.repository';

@Injectable()
export class PrismaHappyHourPromotionsRepository implements IHappyHourPromotionsRepository {
  private readonly includeRelations = {
    products: true,
    categories: true,
  } as const;

  constructor(private readonly prisma: PrismaService) {}

  list(): Promise<HappyHourWithRelations[]> {
    return this.prisma.happyHourPromotion.findMany({
      where: { deletedAt: null },
      orderBy: { id: 'asc' },
      include: this.includeRelations,
    });
  }

  findById(id: number): Promise<HappyHourWithRelations | null> {
    return this.prisma.happyHourPromotion.findFirst({
      where: { id, deletedAt: null },
      include: this.includeRelations,
    });
  }

  create(data: CreateHappyHourPromotionData): Promise<HappyHourWithRelations> {
    const { productIds, categoryIds, ...fields } = data;

    return this.prisma.happyHourPromotion.create({
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
    data: UpdateHappyHourPromotionData,
  ): Promise<HappyHourWithRelations> {
    const { productIds, categoryIds, ...fields } = data;

    return this.prisma.happyHourPromotion.update({
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
    await this.prisma.happyHourPromotion.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
