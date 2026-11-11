import type { PrismaService } from '../../prisma/prisma.service';
import { PrismaProductsRepository } from './prisma-products.repository';

describe('PrismaProductsRepository (H22)', () => {
  const sampleCategoryRow = {
    id: 'cat-1',
    label: 'Pizzas',
    icon: 'pizza',
    kitchenId: 'kitchen-1',
    extras: [],
    products: [],
  };

  it('obtiene la cocina del producto desde su categoría persistida', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      id: 'product-1',
      categoryId: 'cat-1',
      name: 'Pizza',
      description: null,
      isActive: true,
      hasMultipleSizes: false,
      isCombo: false,
      comboPrice: null,
      prices: [{ size: 'único', price: 100 }],
      category: { kitchenId: 'kitchen-1', extras: [] },
      comboGroups: [],
    });
    const repo = new PrismaProductsRepository({
      product: { findFirst },
    } as unknown as PrismaService);

    const product = await repo.getProductById('product-1');

    expect(product?.kitchenId).toBe('kitchen-1');
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'product-1' }),
      }),
    );
  });

  it('omite la agregación SQL de ingresos cuando includeMetrics es false', async () => {
    const findMany = jest.fn().mockResolvedValue([sampleCategoryRow]);
    const $queryRaw = jest.fn();
    const repo = new PrismaProductsRepository({
      category: { findMany },
      $queryRaw,
    } as unknown as PrismaService);

    const categories = await repo.getCategories({ includeMetrics: false });

    expect(findMany).toHaveBeenCalledTimes(1);
    expect($queryRaw).not.toHaveBeenCalled();
    expect(categories).toEqual([
      expect.objectContaining({
        id: 'cat-1',
        label: 'Pizzas',
        totalRevenue: 0,
      }),
    ]);
  });

  it('reutiliza la caché TTL de ingresos por categoría y permite invalidarla explícitamente', async () => {
    const findMany = jest.fn().mockResolvedValue([sampleCategoryRow]);
    const $queryRaw = jest
      .fn()
      .mockResolvedValueOnce([{ categoryId: 'cat-1', totalRevenue: 1250 }])
      .mockResolvedValueOnce([{ categoryId: 'cat-1', totalRevenue: 1800 }]);
    const repo = new PrismaProductsRepository({
      category: { findMany },
      $queryRaw,
    } as unknown as PrismaService);

    const first = await repo.getCategories();
    const second = await repo.getCategories();

    expect($queryRaw).toHaveBeenCalledTimes(1);
    expect(first[0].totalRevenue).toBe(1250);
    expect(second[0].totalRevenue).toBe(1250);

    repo.invalidateCategoryRevenueCache();
    const third = await repo.getCategories();
    expect($queryRaw).toHaveBeenCalledTimes(2);
    expect(third[0].totalRevenue).toBe(1800);
  });

  it('invalida métricas cacheadas después de eliminar un producto', async () => {
    const update = jest.fn().mockResolvedValue({});
    const repo = new PrismaProductsRepository({
      product: { update },
    } as unknown as PrismaService);
    const invalidate = jest.spyOn(repo, 'invalidateCategoryRevenueCache');

    await repo.deleteProduct('product-1');

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'product-1' } }),
    );
    expect(invalidate).toHaveBeenCalledTimes(1);
  });
});
