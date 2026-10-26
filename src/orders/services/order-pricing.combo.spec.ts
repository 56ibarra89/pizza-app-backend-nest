import { BadRequestException } from '@nestjs/common';
import type { ProductEntity } from '../../products/entities/product.entity';
import type { CartItemEntity } from '../entities/order-item.entity';
import { OrderPricingService } from './order-pricing.service';

describe('OrderPricingService combo extras', () => {
  const pizza: ProductEntity = {
    id: 'pizza-1',
    categoryId: 'pizzas',
    name: 'Pizza hawaiana',
    isActive: true,
    hasMultipleSizes: false,
    prices: [{ size: 'único', price: 200 }],
    extras: [
      {
        name: 'Queso adicional',
        prices: [{ size: 'único', price: 20 }],
      },
    ],
  };

  const combo: ProductEntity = {
    id: 'combo-1',
    categoryId: 'combos',
    name: 'Combo especial',
    isActive: true,
    hasMultipleSizes: false,
    isCombo: true,
    comboPrice: 500,
    prices: [{ size: 'único', price: 500 }],
    comboGroups: [
      {
        id: 'group-1',
        name: 'Pizza',
        requiredCount: 1,
        options: [
          {
            id: 'option-1',
            itemProductId: pizza.id,
            size: 'único',
            extraPrice: 10,
          },
        ],
      },
    ],
  };

  const createService = () => {
    const products = {
      getProductById: jest.fn((id: string) => {
        if (id === combo.id) return Promise.resolve(combo);
        if (id === pizza.id) return Promise.resolve(pizza);
        return Promise.reject(new Error('not found'));
      }),
    };
    const appConfig = {
      getByIdOrDefault: jest.fn((id: string) =>
        Promise.resolve({
          data:
            id === 'app_factura_tax_config'
              ? { isExonerated: true, taxes: [] }
              : { sizes: [] },
        }),
      ),
    };
    return new OrderPricingService(
      products as never,
      appConfig as never,
      {} as never,
      {} as never,
      {} as never,
    );
  };

  const createItem = (extraName = 'Queso adicional'): CartItemEntity => ({
    productId: combo.id,
    name: combo.name,
    price: 1,
    size: 'único',
    quantity: 1,
    giftQuantity: 0,
    extras: [],
    isCombo: true,
    comboSelections: [
      {
        groupId: 'group-1',
        groupName: 'Manipulado',
        productId: pizza.id,
        productName: 'Manipulado',
        size: 'único',
        quantity: 1,
        extraPrice: 999,
        extras: [{ name: extraName, price: 999 }],
      },
    ],
  });

  it('uses authoritative option and category-extra prices', async () => {
    const totals = await createService().calculate([createItem()]);

    expect(totals.subTotal).toBe(530);
    expect(totals.total).toBe(530);
  });

  it('returns the authoritative unit price to persist with the order item', async () => {
    const result = await createService().calculateWithPrices([createItem()]);

    expect(result.items[0].price).toBe(530);
    expect(result.totals.subTotal).toBe(530);
  });

  it('rejects an extra that is not available for the component', async () => {
    await expect(
      createService().calculate([createItem('Extra inventado')]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('ignores a manipulated client price for a catalog product', async () => {
    const item: CartItemEntity = {
      productId: pizza.id,
      name: pizza.name,
      price: 1,
      size: 'único',
      quantity: 2,
      giftQuantity: 0,
      extras: [{ name: 'Queso adicional', price: 1 }],
    };

    const result = await createService().calculateWithPrices([item]);

    expect(result.items[0].price).toBe(220);
    expect(result.items[0].extras).toEqual([
      { name: 'Queso adicional', price: 20 },
    ]);
    expect(result.totals.subTotal).toBe(440);
  });

  it('rejects a catalog size that does not exist instead of trusting its price', async () => {
    await expect(
      createService().calculate([
        {
          ...createItem(),
          productId: pizza.id,
          isCombo: false,
          size: 'inventado',
        },
      ]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('honors an already-assigned happy hour promotion when finalizing after the window ends', async () => {
    const happyHours = {
      findById: jest.fn().mockResolvedValue({
        id: 5,
        name: 'Hora Feliz Tarde',
        promotionType: 'PORCENTAJE',
        promotionValue: { toNumber: () => 20 },
        status: 'ACTIVO',
        daysOfWeek: ['MONDAY'],
        startMinutes: 960,
        endMinutes: 1080,
        products: [],
        categories: [],
      }),
    };
    const service = new OrderPricingService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      happyHours as never,
    );

    const resolved = await service.resolvePromotion(
      {},
      { happyHourId: 5 },
      new Date('2026-10-20T23:30:00.000Z'),
    );

    expect(resolved).toMatchObject({ source: 'happy-hour', happyHourId: 5 });
  });

  it('rejects a new happy hour promotion when applied outside the active window', async () => {
    const happyHours = {
      findById: jest.fn().mockResolvedValue({
        id: 5,
        name: 'Hora Feliz Tarde',
        promotionType: 'PORCENTAJE',
        promotionValue: { toNumber: () => 20 },
        status: 'ACTIVO',
        daysOfWeek: ['MONDAY'],
        startMinutes: 960,
        endMinutes: 1080,
        products: [],
        categories: [],
      }),
    };
    const service = new OrderPricingService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      happyHours as never,
    );

    await expect(
      service.resolvePromotion(
        { happyHourId: 5 },
        undefined,
        new Date('2026-10-20T23:30:00.000Z'),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows additional non-2x1 items on an order with a preserved 2x1 happy hour while rejecting excessive gifts', async () => {
    const service = createService();
    const twoForOnePromo = {
      source: 'happy-hour' as const,
      happyHourId: 7,
      rule: {
        id: 7,
        name: '2x1 Pizzas',
        promotionType: 'DOSXUNO' as const,
        promotionValue: null,
        status: 'ACTIVO' as const,
        daysOfWeek: ['MONDAY' as const],
        startMinutes: 960,
        endMinutes: 1080,
        appliesTo: 'Todos',
        products: [],
        categories: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        createdById: null,
        updatedById: null,
        deletedAt: null,
      },
    };

    const validResult = await service.calculateWithPrices(
      [
        {
          productId: pizza.id,
          name: pizza.name,
          price: 200,
          size: 'único',
          quantity: 2,
          giftQuantity: 1,
          giftReason: 'happy-hour-2x1',
          extras: [],
        },
        {
          productId: pizza.id,
          name: pizza.name,
          price: 200,
          size: 'único',
          quantity: 2,
          giftQuantity: 0,
          extras: [],
        },
      ],
      twoForOnePromo,
    );
    expect(validResult.totals.subTotal).toBe(600);

    await expect(
      service.calculateWithPrices(
        [
          {
            productId: pizza.id,
            name: pizza.name,
            price: 200,
            size: 'único',
            quantity: 2,
            giftQuantity: 2,
            giftReason: 'happy-hour-2x1',
            extras: [],
          },
        ],
        twoForOnePromo,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('keeps split-bill credit items non-discountable and respects overrideDiscountAmount', async () => {
    const service = createService();
    const result = await service.calculateWithPrices(
      [
        {
          productId: pizza.id,
          name: pizza.name,
          price: 200,
          size: 'único',
          quantity: 2,
          giftQuantity: 0,
          extras: [],
        },
        {
          name: 'Abono subcuenta (Persona 1)',
          price: -180,
          size: 'único',
          quantity: 1,
          giftQuantity: 0,
          extras: [],
        },
      ],
      { source: 'none' },
      20,
    );

    expect(result.totals.subTotal).toBe(220);
    expect(result.totals.discountAmount).toBe(20);
    expect(result.totals.total).toBe(200);
  });
});
