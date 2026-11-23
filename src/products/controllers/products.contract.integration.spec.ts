import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { RolesGuard, UserRoleDto } from '../../common';
import { PrismaService } from '../../prisma/prisma.service';
import { PRODUCTS_REPOSITORY } from '../interfaces/products.repository';
import { PrismaProductsRepository } from '../repositories/prisma-products.repository';
import { ProductsService } from '../services/products.service';
import { ProductsController } from './products.controller';

describe('Catalog HTTP contract RD-04/RD-12', () => {
  const categoryId = '00000000-0000-4000-8000-000000000001';
  const productId = '00000000-0000-4000-8000-000000000002';
  const currentCombo = {
    id: productId,
    categoryId,
    name: 'Combo',
    description: null,
    isActive: true,
    hasMultipleSizes: false,
    isCombo: true,
    comboPrice: 200,
    prices: [{ size: 'unico', price: 190 }],
  };
  const createProduct = jest.fn();
  const updateProduct = jest.fn();
  const deleteProductPrices = jest.fn();
  const prismaMock = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: productId }]),
    $transaction: jest.fn(),
    category: {
      findFirst: jest.fn().mockResolvedValue({ id: categoryId }),
      findMany: jest.fn().mockResolvedValue([
        {
          id: categoryId,
          label: 'Combos',
          extras: [
            {
              id: 'extra-1',
              name: 'Salsa',
              isActive: true,
              sortOrder: 0,
              prices: [
                { size: 'unico', price: 10 },
                { size: 'grande', price: 20 },
              ],
            },
          ],
          products: [currentCombo],
        },
      ]),
    },
    product: {
      findUniqueOrThrow: jest.fn().mockResolvedValue(currentCombo),
      findFirst: jest.fn().mockResolvedValue(currentCombo),
      create: createProduct,
      update: updateProduct,
    },
    productPrice: { deleteMany: deleteProductPrices },
  };
  let app: INestApplication;

  beforeAll(async () => {
    prismaMock.$transaction.mockImplementation(
      (callback: (client: typeof prismaMock) => Promise<unknown>) =>
        callback(prismaMock),
    );
    const module = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [
        RolesGuard,
        ProductsService,
        { provide: PRODUCTS_REPOSITORY, useClass: PrismaProductsRepository },
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    app = module.createNestApplication();
    app.use((req, _res, next) => {
      req.user = {
        role: UserRoleDto.admin,
        permissions: String(req.headers['x-test-permissions'] ?? '').split(','),
      };
      next();
    });
    app.useGlobalGuards(module.get(RolesGuard));
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterAll(() => app.close());

  it('transporta extras una vez en modo compacto y conserva el contrato legado', async () => {
    await request(app.getHttpServer())
      .get(
        '/products/categories?includeMetrics=false&includeProductExtras=false',
      )
      .expect(403);

    const compact = await request(app.getHttpServer())
      .get(
        '/products/categories?includeMetrics=false&includeProductExtras=false',
      )
      .set('x-test-permissions', 'products.read')
      .expect(200);
    const legacy = await request(app.getHttpServer())
      .get('/products/categories?includeMetrics=false')
      .set('x-test-permissions', 'products.read')
      .expect(200);
    expect(compact.body[0].extras).toHaveLength(1);
    expect(compact.body[0].items[0]).not.toHaveProperty('extras');
    expect(legacy.body[0].items[0].extras[0].prices).toEqual([
      { size: 'unico', price: 10 },
    ]);
    expect(compact.body[0].items[0]).toMatchObject({
      comboPrice: 200,
      prices: [{ size: 'unico', price: 200 }],
    });
  });

  it('acepta el alias legado al crear un combo y conserva una sola escritura de precio', async () => {
    const prices = [{ size: 'único', price: 210 }];
    createProduct.mockResolvedValueOnce({
      ...currentCombo,
      prices,
      comboPrice: null,
    });
    const response = await request(app.getHttpServer())
      .post('/products')
      .set('x-test-permissions', 'products.manage')
      .send({ categoryId, name: 'Combo nuevo', isCombo: true, comboPrice: 210 })
      .expect(201);
    expect(createProduct.mock.calls[0][0].data).not.toHaveProperty(
      'comboPrice',
    );
    expect(createProduct.mock.calls[0][0].data.prices.create).toEqual(prices);
    expect(response.body).toMatchObject({ comboPrice: 210, prices });
  });

  it('rechaza precios contradictorios y migra el importe vigente al editar un combo legado', async () => {
    await request(app.getHttpServer())
      .patch(`/products/${productId}`)
      .set('x-test-permissions', 'products.manage')
      .send({ comboPrice: 210, prices: [{ size: 'unico', price: 220 }] })
      .expect(400);
    expect(updateProduct).not.toHaveBeenCalled();
    expect(deleteProductPrices).not.toHaveBeenCalled();

    const prices = [{ size: 'unico', price: 200 }];
    updateProduct.mockResolvedValueOnce({
      ...currentCombo,
      prices,
      comboPrice: null,
    });
    const response = await request(app.getHttpServer())
      .patch(`/products/${productId}`)
      .set('x-test-permissions', 'products.manage')
      .send({ name: 'Combo editado' })
      .expect(200);
    expect(updateProduct.mock.calls[0][0].data).toMatchObject({
      comboPrice: null,
      prices: { create: prices },
    });
    expect(deleteProductPrices).toHaveBeenCalledWith({ where: { productId } });
    expect(response.body).toMatchObject({ comboPrice: 200, prices });
  });
});
