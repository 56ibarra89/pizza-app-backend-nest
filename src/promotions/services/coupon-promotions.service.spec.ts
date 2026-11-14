import { BadRequestException } from '@nestjs/common';
import { CuponDiscountType, CuponManualStatus, Prisma } from '@prisma/client';
import { CouponPromotionsService } from './coupon-promotions.service';

describe('CouponPromotionsService', () => {
  const repository = {
    list: jest.fn(),
    findById: jest.fn(),
    findByCode: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  let service: CouponPromotionsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CouponPromotionsService(repository);
  });

  it('interpreta expiresDate fecha-only usando fin de día en America/Managua', async () => {
    repository.create.mockImplementation(async (data) => ({
      id: 1,
      ...data,
      discountType: CuponDiscountType.PORCENTAJE,
      discountValue: new Prisma.Decimal(10),
      manualStatus: CuponManualStatus.ACTIVO,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    await service.create({
      code: 'promo10',
      discountType: 'porcentaje',
      discountValue: 10,
      expiresDate: '2026-11-15',
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'PROMO10',
        expiresDate: new Date('2026-11-16T05:59:59.999Z'),
      }),
    );
  });

  it('rechaza fechas de expiración inválidas', async () => {
    await expect(
      service.create({
        code: 'promo10',
        discountType: 'porcentaje',
        discountValue: 10,
        expiresDate: 'invalid-date',
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
