import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateProductDto } from '../dto/create-product.dto';
import {
  validateCreateProduct,
  validateUpdateProduct,
} from '../validators/products.validator';

describe('products.validator', () => {
  it('accepts single-size product with unico', () => {
    const dto: CreateProductDto = {
      categoryId: '00000000-0000-0000-0000-000000000000',
      name: 'Coca',
      hasMultipleSizes: false,
      prices: [{ size: 'único', price: 10 }],
    };

    expect(() => validateCreateProduct(dto)).not.toThrow();
  });

  it('rejects multi-size product containing unico', () => {
    const dto: CreateProductDto = {
      categoryId: '00000000-0000-0000-0000-000000000000',
      name: 'Pizza',
      hasMultipleSizes: true,
      prices: [
        { size: 'familiar', price: 100 },
        { size: 'único', price: 50 },
      ],
    };

    expect(() => validateCreateProduct(dto)).toThrow();
  });

  it('acepta combo con comboPrice omitiendo prices en DTO y rechaza tamaños duplicados case-insensitive o nombres vacíos (B43)', async () => {
    const comboDto = plainToInstance(CreateProductDto, {
      categoryId: '00000000-0000-0000-0000-000000000000',
      name: '  Combo Familiar  ',
      isCombo: true,
      comboPrice: 450,
    });
    const comboErrors = await validate(comboDto);
    expect(comboErrors).toHaveLength(0);

    validateCreateProduct(comboDto);
    expect(comboDto.name).toBe('Combo Familiar');
    expect(comboDto.prices).toEqual([{ size: 'único', price: 450 }]);

    const badComboDto = plainToInstance(CreateProductDto, {
      categoryId: '00000000-0000-0000-0000-000000000000',
      name: 'Combo Negativo',
      isCombo: true,
      comboPrice: -10,
    });
    expect(await validate(badComboDto)).not.toHaveLength(0);

    expect(() =>
      validateCreateProduct({
        categoryId: '00000000-0000-0000-0000-000000000000',
        name: '   ',
        hasMultipleSizes: false,
        prices: [{ size: 'único', price: 100 }],
      }),
    ).toThrow();

    expect(() =>
      validateUpdateProduct(
        {
          prices: [
            { size: 'Grande', price: 200 },
            { size: 'grande ', price: 220 },
          ],
        },
        true,
      ),
    ).toThrow();
  });
});
