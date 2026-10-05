import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { IProductsRepository } from '../interfaces/products.repository';
import type { CategoryEntity } from '../entities/category.entity';
import type { ProductEntity } from '../entities/product.entity';
import type { CreateCategoryDto } from '../dto/create-category.dto';
import type { UpdateCategoryDto } from '../dto/update-category.dto';
import type { CreateProductDto } from '../dto/create-product.dto';
import type { UpdateProductDto } from '../dto/update-product.dto';
import type {
  CreateCategoryExtraDto,
  UpdateCategoryExtraDto,
} from '../dto/category-extra.dto';
import type { ExtraIngredientEntity } from '../entities/product.entity';

const CATEGORY_EXTRAS_INCLUDE = {
  prices: { orderBy: { size: 'asc' as const } },
};

const PRODUCT_BASE_INCLUDE = {
  prices: { orderBy: { size: 'asc' as const } },
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
        extras: {
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          include: CATEGORY_EXTRAS_INCLUDE,
        },
        products: {
          where: { deletedAt: null },
          orderBy: { name: 'asc' },
          include: PRODUCT_BASE_INCLUDE,
        },
      },
    });

    return categories.map((c) => ({
      id: c.id,
      label: c.label,
      icon: c.icon ?? undefined,
      kitchenId: c.kitchenId ?? undefined,
      extras: c.extras.map((extra) => this.mapExtra(extra)),
      items: c.products.map((p) => this.mapProduct(p, c.extras)),
    }));
  }

  async createCategory(dto: CreateCategoryDto): Promise<CategoryEntity> {
    const created = await this.prisma.category.create({
      data: { label: dto.label, icon: dto.icon, kitchenId: dto.kitchenId },
      include: { products: true, extras: true },
    });

    return {
      id: created.id,
      label: created.label,
      icon: created.icon ?? undefined,
      kitchenId: created.kitchenId ?? undefined,
      extras: [],
      items: [],
    };
  }

  async updateCategory(
    id: string,
    dto: UpdateCategoryDto,
  ): Promise<CategoryEntity> {
    const updated = await this.prisma.category.update({
      where: { id },
      data: { label: dto.label, icon: dto.icon, kitchenId: dto.kitchenId },
      include: {
        extras: {
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          include: CATEGORY_EXTRAS_INCLUDE,
        },
        products: {
          where: { deletedAt: null },
          orderBy: { name: 'asc' },
          include: PRODUCT_BASE_INCLUDE,
        },
      },
    });

    return {
      id: updated.id,
      label: updated.label,
      icon: updated.icon ?? undefined,
      kitchenId: updated.kitchenId ?? undefined,
      extras: updated.extras.map((extra) => this.mapExtra(extra)),
      items: updated.products.map((p) => this.mapProduct(p, updated.extras)),
    };
  }

  async deleteCategory(id: string): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.product.updateMany({
        where: { categoryId: id, deletedAt: null },
        data: { deletedAt: now },
      }),
      this.prisma.category.update({ where: { id }, data: { deletedAt: now } }),
    ]);
  }

  async createCategoryExtra(
    categoryId: string,
    dto: CreateCategoryExtraDto,
  ): Promise<ExtraIngredientEntity> {
    this.validateExtraPrices(dto.prices);
    const duplicate = await this.prisma.categoryExtra.findFirst({
      where: {
        categoryId,
        name: { equals: dto.name.trim(), mode: 'insensitive' },
      },
    });
    if (duplicate)
      throw new BadRequestException(
        'Ya existe un extra con ese nombre en la categoría',
      );

    const extra = await this.prisma.categoryExtra.create({
      data: {
        categoryId,
        name: dto.name.trim(),
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
        prices: {
          create: dto.prices.map((price) => ({
            size: price.size,
            price: price.price,
          })),
        },
      },
      include: CATEGORY_EXTRAS_INCLUDE,
    });
    return this.mapExtra(extra);
  }

  async updateCategoryExtra(
    categoryId: string,
    extraId: string,
    dto: UpdateCategoryExtraDto,
  ): Promise<ExtraIngredientEntity> {
    const existing = await this.prisma.categoryExtra.findFirst({
      where: { id: extraId, categoryId },
    });
    if (!existing)
      throw new NotFoundException('Extra no encontrado en la categoría');
    if (dto.prices) this.validateExtraPrices(dto.prices);
    if (dto.name) {
      const duplicate = await this.prisma.categoryExtra.findFirst({
        where: {
          categoryId,
          id: { not: extraId },
          name: { equals: dto.name.trim(), mode: 'insensitive' },
        },
      });
      if (duplicate)
        throw new BadRequestException(
          'Ya existe un extra con ese nombre en la categoría',
        );
    }

    const extra = await this.prisma.$transaction(async (tx) => {
      if (dto.prices)
        await tx.categoryExtraPrice.deleteMany({ where: { extraId } });
      return tx.categoryExtra.update({
        where: { id: extraId },
        data: {
          name: dto.name?.trim(),
          isActive: dto.isActive,
          sortOrder: dto.sortOrder,
          prices: dto.prices
            ? {
                create: dto.prices.map((price) => ({
                  size: price.size,
                  price: price.price,
                })),
              }
            : undefined,
        },
        include: CATEGORY_EXTRAS_INCLUDE,
      });
    });
    return this.mapExtra(extra);
  }

  async deleteCategoryExtra(
    categoryId: string,
    extraId: string,
  ): Promise<void> {
    const deleted = await this.prisma.categoryExtra.deleteMany({
      where: { id: extraId, categoryId },
    });
    if (!deleted.count)
      throw new NotFoundException('Extra no encontrado en la categoría');
  }

  async getProducts(params?: {
    categoryId?: string;
  }): Promise<ProductEntity[]> {
    const products = await this.prisma.product.findMany({
      where: {
        deletedAt: null,
        category: { deletedAt: null },
        ...(params?.categoryId ? { categoryId: params.categoryId } : {}),
      },
      orderBy: { name: 'asc' },
      include: {
        ...PRODUCT_BASE_INCLUDE,
        category: {
          include: {
            extras: {
              where: { isActive: true },
              orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
              include: CATEGORY_EXTRAS_INCLUDE,
            },
          },
        },
      },
    });

    return products.map((p) => this.mapProduct(p));
  }

  async getProductById(id: string): Promise<ProductEntity | null> {
    const product = await this.prisma.product.findFirst({
      where: { id, deletedAt: null, category: { deletedAt: null } },
      include: {
        ...PRODUCT_BASE_INCLUDE,
        category: {
          include: {
            extras: {
              where: { isActive: true },
              orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
              include: CATEGORY_EXTRAS_INCLUDE,
            },
          },
        },
      },
    });
    return product ? this.mapProduct(product) : null;
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
      include: {
        ...PRODUCT_BASE_INCLUDE,
        category: {
          include: {
            extras: {
              where: { isActive: true },
              orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
              include: CATEGORY_EXTRAS_INCLUDE,
            },
          },
        },
      },
    });

    return this.mapProduct(created);
  }

  async updateProduct(
    id: string,
    dto: UpdateProductDto,
  ): Promise<ProductEntity> {
    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.prices) {
        await tx.productPrice.deleteMany({ where: { productId: id } });
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
                create: dto.prices.map((p) => ({
                  size: p.size,
                  price: p.price,
                })),
              }
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
        include: {
          ...PRODUCT_BASE_INCLUDE,
          category: {
            include: {
              extras: {
                where: { isActive: true },
                orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
                include: CATEGORY_EXTRAS_INCLUDE,
              },
            },
          },
        },
      });
    });

    return this.mapProduct(updated);
  }

  async deleteProduct(id: string): Promise<void> {
    await this.prisma.product.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  private mapExtra(extra: {
    id: string;
    name: string;
    isActive: boolean;
    sortOrder: number;
    prices: { size: string; price: unknown }[];
  }): ExtraIngredientEntity {
    return {
      id: extra.id,
      name: extra.name,
      isActive: extra.isActive,
      sortOrder: extra.sortOrder,
      prices: extra.prices.map((price) => ({
        size: price.size,
        price: Number(price.price),
      })),
    };
  }

  private validateExtraPrices(prices: Array<{ size: string }>): void {
    const sizes = prices.map((price) => price.size.trim().toLowerCase());
    if (new Set(sizes).size !== sizes.length) {
      throw new BadRequestException('El extra contiene tamaños duplicados');
    }
  }

  private mapProduct(
    p: {
      id: string;
      categoryId: string;
      name: string;
      description: string | null;
      isActive: boolean;
      hasMultipleSizes: boolean;
      isCombo?: boolean;
      comboPrice?: unknown;
      prices: { size: string; price: unknown }[];
      category?: {
        extras: Array<{
          id: string;
          name: string;
          isActive: boolean;
          sortOrder: number;
          prices: { size: string; price: unknown }[];
        }>;
      };
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
    },
    categoryExtras?: Array<{
      id: string;
      name: string;
      isActive: boolean;
      sortOrder: number;
      prices: { size: string; price: unknown }[];
    }>,
  ): ProductEntity {
    const prices = p.prices.map((pp) => ({
      size: pp.size,
      price: Number(pp.price),
    }));

    const inheritedExtras = categoryExtras ?? p.category?.extras ?? [];
    const productSizes = new Set(
      prices.map((price) => price.size.toLowerCase()),
    );
    const extras = inheritedExtras.length
      ? inheritedExtras
          .filter((extra) => extra.isActive)
          .map((extra) => ({
            ...this.mapExtra(extra),
            prices: this.mapExtra(extra).prices.filter((price) =>
              productSizes.has(price.size.toLowerCase()),
            ),
          }))
          .filter((extra) => extra.prices.length > 0)
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
