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

  it('rejects an extra that is not available for the component', async () => {
    await expect(
      createService().calculate([createItem('Extra inventado')]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
