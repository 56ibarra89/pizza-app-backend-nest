import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { IProductsRepository } from '../interfaces/products.repository';
import type { CategoryEntity } from '../entities/category.entity';
import type { ProductEntity } from '../entities/product.entity';
import type { CreateCategoryDto } from '../dto/create-category.dto';
import type { UpdateCategoryDto } from '../dto/update-category.dto';
import type { CreateProductDto } from '../dto/create-product.dto';
import type { UpdateProductDto } from '../dto/update-product.dto';
import { fromDbSize, toDbSize } from '../mappers/products.mapper';

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
          include: {
            prices: { orderBy: { size: 'asc' } },
            extras: { include: { prices: { orderBy: { size: 'asc' } } } },
          },
        },
      },
    });

    return categories.map((c) => ({
      id: c.id,
      label: c.label,
      icon: c.icon ?? undefined,
      items: c.products.map((p) => this.mapProduct(p)),
    }));
  }

  async createCategory(dto: CreateCategoryDto): Promise<CategoryEntity> {
    const created = await this.prisma.category.create({
      data: { label: dto.label, icon: dto.icon },
      include: { products: true },
    });

    return { id: created.id, label: created.label, icon: created.icon ?? undefined, items: [] };
  }

  async updateCategory(id: string, dto: UpdateCategoryDto): Promise<CategoryEntity> {
    const updated = await this.prisma.category.update({
      where: { id },
      data: { label: dto.label, icon: dto.icon },
      include: {
        products: {
          where: { deletedAt: null },
          orderBy: { name: 'asc' },
          include: {
            prices: { orderBy: { size: 'asc' } },
            extras: { include: { prices: { orderBy: { size: 'asc' } } } },
          },
        },
      },
    });

    return {
      id: updated.id,
      label: updated.label,
      icon: updated.icon ?? undefined,
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
      include: {
        prices: { orderBy: { size: 'asc' } },
        extras: { include: { prices: { orderBy: { size: 'asc' } } } },
      },
    });

    return products.map((p) => this.mapProduct(p));
  }

  async getProductById(id: string): Promise<ProductEntity | null> {
    const product = await this.prisma.product.findFirst({
      where: { id, deletedAt: null, category: { deletedAt: null } },
      include: {
        prices: { orderBy: { size: 'asc' } },
        extras: { include: { prices: { orderBy: { size: 'asc' } } } },
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
        hasMultipleSizes: dto.hasMultipleSizes ?? false,
        prices: {
          create: dto.prices.map((p) => ({ size: toDbSize(p.size), price: p.price })),
        },
        extras: dto.extras?.length
          ? {
              create: dto.extras.map((e) => ({
                name: e.name,
                prices: { create: e.prices.map((p) => ({ size: toDbSize(p.size), price: p.price })) },
              })),
            }
          : undefined,
      },
      include: {
        prices: { orderBy: { size: 'asc' } },
        extras: { include: { prices: { orderBy: { size: 'asc' } } } },
      },
    });

    return this.mapProduct(created);
  }

  async updateProduct(id: string, dto: UpdateProductDto): Promise<ProductEntity> {
    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.prices) {
        await tx.productPrice.deleteMany({ where: { productId: id } });
      }
      if (dto.extras) {
        await tx.extraIngredient.deleteMany({ where: { productId: id } });
      }

      return tx.product.update({
        where: { id },
        data: {
          categoryId: dto.categoryId,
          name: dto.name,
          description: dto.description,
          hasMultipleSizes: dto.hasMultipleSizes,
          prices: dto.prices
            ? {
                create: dto.prices.map((p) => ({ size: toDbSize(p.size), price: p.price })),
              }
            : undefined,
          extras: dto.extras
            ? dto.extras.length
              ? {
                  create: dto.extras.map((e) => ({
                    name: e.name,
                    prices: { create: e.prices.map((p) => ({ size: toDbSize(p.size), price: p.price })) },
                  })),
                }
              : undefined
            : undefined,
        },
        include: {
          prices: { orderBy: { size: 'asc' } },
          extras: { include: { prices: { orderBy: { size: 'asc' } } } },
        },
      });
    });

    return this.mapProduct(updated);
  }

  async deleteProduct(id: string): Promise<void> {
    await this.prisma.product.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  private mapProduct(p: {
    id: string;
    categoryId: string;
    name: string;
    description: string | null;
    hasMultipleSizes: boolean;
    prices: { size: import('@prisma/client').ProductSize; price: unknown }[];
    extras: {
      name: string;
      prices: { size: import('@prisma/client').ProductSize; price: unknown }[];
    }[];
  }): ProductEntity {
    const prices = p.prices.map((pp) => ({
      size: fromDbSize(pp.size),
      price: Number(pp.price),
    }));

    const extras = p.extras.length
      ? p.extras.map((e) => ({
          name: e.name,
          prices: e.prices.map((ep) => ({ size: fromDbSize(ep.size), price: Number(ep.price) })),
        }))
      : undefined;

    return {
      id: p.id,
      categoryId: p.categoryId,
      name: p.name,
      description: p.description ?? undefined,
      hasMultipleSizes: p.hasMultipleSizes,
      prices,
      extras,
    };
  }
}
