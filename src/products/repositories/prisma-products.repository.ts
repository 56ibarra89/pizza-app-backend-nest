import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { IProductsRepository } from '../interfaces/products.repository';
import type { CategoryEntity } from '../entities/category.entity';
import type { ProductEntity } from '../entities/product.entity';
import type { CreateCategoryDto } from '../dto/create-category.dto';
import type { UpdateCategoryDto } from '../dto/update-category.dto';
import type { CreateProductDto } from '../dto/create-product.dto';
import type { UpdateProductDto } from '../dto/update-product.dto';

const PRODUCT_INCLUDE = {
  prices: { orderBy: { size: 'asc' as const } },
  extras: { include: { prices: { orderBy: { size: 'asc' as const } } } },
  comboGroups: {
    include: {
      options: {
        include: {
          itemProduct: { select: { id: true, name: true } },
        },
      },
    },
  },
};

@Injectable()
export class PrismaProductsRepository implements IProductsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getCategories(): Promise<CategoryEntity[]> {
    const categories = await this.prisma.category.findMany({
      where: { deletedAt: null },
      orderBy: { label: 'asc' },
      include: {
        products: {
          where: { deletedAt: null },
          orderBy: { name: 'asc' },
          include: PRODUCT_INCLUDE,
        },
      },
    });

    return categories.map((c) => ({
      id: c.id,
      label: c.label,
      icon: c.icon ?? undefined,
      kitchenId: c.kitchenId ?? undefined,
      items: c.products.map((p) => this.mapProduct(p as any)),
    }));
  }

  async createCategory(dto: CreateCategoryDto): Promise<CategoryEntity> {
    const created = await this.prisma.category.create({
      data: { label: dto.label, icon: dto.icon, kitchenId: dto.kitchenId },
      include: { products: true },
    });

    return { id: created.id, label: created.label, icon: created.icon ?? undefined, kitchenId: created.kitchenId ?? undefined, items: [] };
  }

  async updateCategory(id: string, dto: UpdateCategoryDto): Promise<CategoryEntity> {
    const updated = await this.prisma.category.update({
      where: { id },
      data: { label: dto.label, icon: dto.icon, kitchenId: dto.kitchenId },
      include: {
        products: {
          where: { deletedAt: null },
          orderBy: { name: 'asc' },
          include: PRODUCT_INCLUDE,
        },
      },
    });

    return {
      id: updated.id,
      label: updated.label,
      icon: updated.icon ?? undefined,
      kitchenId: updated.kitchenId ?? undefined,
      items: updated.products.map((p) => this.mapProduct(p)),
    };
  }

  async deleteCategory(id: string): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.product.updateMany({ where: { categoryId: id, deletedAt: null }, data: { deletedAt: now } }),
      this.prisma.category.update({ where: { id }, data: { deletedAt: now } }),
    ]);
  }

  async getProducts(params?: { categoryId?: string }): Promise<ProductEntity[]> {
    const products = await this.prisma.product.findMany({
      where: {
        deletedAt: null,
        category: { deletedAt: null },
        ...(params?.categoryId ? { categoryId: params.categoryId } : {}),
      },
      orderBy: { name: 'asc' },
      include: PRODUCT_INCLUDE,
    });

    return products.map((p) => this.mapProduct(p as any));
  }

  async getProductById(id: string): Promise<ProductEntity | null> {
    const product = await this.prisma.product.findFirst({
      where: { id, deletedAt: null, category: { deletedAt: null } },
      include: PRODUCT_INCLUDE,
    });
    return product ? this.mapProduct(product as any) : null;
  }

  async createProduct(dto: CreateProductDto): Promise<ProductEntity> {
    const created = await this.prisma.product.create({
      data: {
        categoryId: dto.categoryId,
        name: dto.name,
        description: dto.description,
        isActive: dto.isActive ?? true,
        hasMultipleSizes: dto.hasMultipleSizes ?? false,
        isCombo: dto.isCombo ?? false,
        comboPrice: dto.comboPrice ?? null,
        prices: {
          create: dto.prices.map((p) => ({ size: p.size, price: p.price })),
        },
        extras: dto.extras?.length
          ? {
              create: dto.extras.map((e) => ({
                name: e.name,
                prices: { create: e.prices.map((p) => ({ size: p.size, price: p.price })) },
              })),
            }
          : undefined,
        comboGroups: dto.comboGroups?.length
          ? {
              create: dto.comboGroups.map((g) => ({
                name: g.name,
                requiredCount: g.requiredCount,
                options: {
                  create: g.options.map((o) => ({
                    itemProductId: o.itemProductId,
                    size: o.size || null,
                    extraPrice: o.extraPrice ?? 0,
                  })),
                },
              })),
            }
          : undefined,
      },
      include: PRODUCT_INCLUDE,
    });

    return this.mapProduct(created as any);
  }

  async updateProduct(id: string, dto: UpdateProductDto): Promise<ProductEntity> {
    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.prices) {
        await tx.productPrice.deleteMany({ where: { productId: id } });
      }
      if (dto.extras) {
        await tx.extraIngredient.deleteMany({ where: { productId: id } });
      }
      if (dto.comboGroups) {
        await tx.comboGroup.deleteMany({ where: { productId: id } });
      }

      return tx.product.update({
        where: { id },
        data: {
          categoryId: dto.categoryId,
          name: dto.name,
          description: dto.description,
          isActive: dto.isActive,
          hasMultipleSizes: dto.hasMultipleSizes,
          isCombo: dto.isCombo,
          comboPrice: dto.comboPrice,
          prices: dto.prices
            ? {
                create: dto.prices.map((p) => ({ size: p.size, price: p.price })),
              }
            : undefined,
          extras: dto.extras
            ? dto.extras.length
              ? {
                  create: dto.extras.map((e) => ({
                    name: e.name,
                    prices: { create: e.prices.map((p) => ({ size: p.size, price: p.price })) },
                  })),
                }
              : undefined
            : undefined,
          comboGroups: dto.comboGroups
            ? dto.comboGroups.length
              ? {
                  create: dto.comboGroups.map((g) => ({
                    name: g.name,
                    requiredCount: g.requiredCount,
                    options: {
                      create: g.options.map((o) => ({
                        itemProductId: o.itemProductId,
                        size: o.size || null,
                        extraPrice: o.extraPrice ?? 0,
                      })),
                    },
                  })),
                }
              : undefined
            : undefined,
        },
        include: PRODUCT_INCLUDE,
      });
    });

    return this.mapProduct(updated as any);
  }

  async deleteProduct(id: string): Promise<void> {
    await this.prisma.product.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  private mapProduct(p: {
    id: string;
    categoryId: string;
    name: string;
    description: string | null;
    isActive: boolean;
    hasMultipleSizes: boolean;
    isCombo?: boolean;
    comboPrice?: unknown;
    prices: { size: string; price: unknown }[];
    extras: {
      name: string;
      prices: { size: string; price: unknown }[];
    }[];
    comboGroups?: Array<{
      id: string;
      name: string;
      requiredCount: number;
      options: Array<{
        id: string;
        itemProductId: string;
        size: string | null;
        extraPrice: unknown;
        itemProduct?: { id: string; name: string } | null;
      }>;
    }>;
  }): ProductEntity {
    const prices = p.prices.map((pp) => ({
      size: pp.size,
      price: Number(pp.price),
    }));

    const extras = p.extras.length
      ? p.extras.map((e) => ({
          name: e.name,
          prices: e.prices.map((ep) => ({ size: ep.size, price: Number(ep.price) })),
        }))
      : undefined;

    const comboGroups = p.comboGroups?.length
      ? p.comboGroups.map((g) => ({
          id: g.id,
          name: g.name,
          requiredCount: g.requiredCount,
          options: g.options.map((o) => ({
            id: o.id,
            itemProductId: o.itemProductId,
            itemProductName: o.itemProduct?.name,
            size: o.size ?? undefined,
            extraPrice: Number(o.extraPrice || 0),
          })),
        }))
      : undefined;

    return {
      id: p.id,
      categoryId: p.categoryId,
      name: p.name,
      description: p.description ?? undefined,
      isActive: p.isActive,
      hasMultipleSizes: p.hasMultipleSizes,
      isCombo: p.isCombo ?? false,
      comboPrice:
        p.comboPrice !== null && p.comboPrice !== undefined
          ? Number(p.comboPrice)
          : undefined,
      prices,
      extras,
      comboGroups,
    };
  }
}
