import { validateCreateProduct } from '../validators/products.validator';
import { ProductSizeDto } from '../dto/product-size.dto';
import type { CreateProductDto } from '../dto/create-product.dto';

describe('products.validator', () => {
  it('accepts single-size product with unico', () => {
    const dto: CreateProductDto = {
      categoryId: '00000000-0000-0000-0000-000000000000',
      name: 'Coca',
      hasMultipleSizes: false,
      prices: [{ size: ProductSizeDto.unico, price: 10 }],
    };

    expect(() => validateCreateProduct(dto)).not.toThrow();
  });

  it('rejects multi-size product containing unico', () => {
    const dto: CreateProductDto = {
      categoryId: '00000000-0000-0000-0000-000000000000',
      name: 'Pizza',
      hasMultipleSizes: true,
      prices: [
        { size: ProductSizeDto.familiar, price: 100 },
        { size: ProductSizeDto.unico, price: 50 },
      ],
    };

    expect(() => validateCreateProduct(dto)).toThrow();
  });
});
