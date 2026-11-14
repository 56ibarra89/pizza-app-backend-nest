import { HappyHourPromotionType, PromoActiveStatus } from '@prisma/client';
import { CommercialPromotionsService } from './commercial-promotions.service';

describe('CommercialPromotionsService.updateHappyHour (B46)', () => {
  const toDecimal = (value: number) => ({ toNumber: () => value });

  const createService = (existingPromotionType: HappyHourPromotionType) => {
    const happyHoursRepository = {
      list: jest.fn(),
      findById: jest.fn().mockResolvedValue({
        id: 10,
        name: 'Promo Tarde',
        daysOfWeek: ['MONDAY'],
        startMinutes: 840,
        endMinutes: 1020,
        promotionType: existingPromotionType,
        promotionValue:
          existingPromotionType === HappyHourPromotionType.DOSXUNO
            ? null
            : toDecimal(20),
        status: PromoActiveStatus.ACTIVO,
        appliesTo:
          existingPromotionType === HappyHourPromotionType.DOSXUNO
            ? 'Pizzas'
            : null,
        products: [],
        categories: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      create: jest.fn(),
      update: jest.fn().mockImplementation(async (_id, data) => ({
        id: 10,
        name: 'Promo Tarde',
        daysOfWeek: ['MONDAY'],
        startMinutes: 840,
        endMinutes: 1020,
        promotionType: data.promotionType ?? existingPromotionType,
        promotionValue:
          typeof data.promotionValue === 'number'
            ? toDecimal(data.promotionValue)
            : (data.promotionValue ?? null),
        status: PromoActiveStatus.ACTIVO,
        appliesTo: data.appliesTo === undefined ? null : data.appliesTo,
        products: [],
        categories: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      delete: jest.fn(),
    };
    const discountsRepository = {
      list: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    return {
      service: new CommercialPromotionsService(
        happyHoursRepository,
        discountsRepository,
      ),
      happyHoursRepository,
    };
  };

  it('limpia promotionValue cuando cambia a 2x1 aunque no se envíe en el PATCH', async () => {
    const { service, happyHoursRepository } = createService(
      HappyHourPromotionType.PORCENTAJE,
    );

    await service.updateHappyHour(10, {
      promotionType: '2x1',
      appliesTo: 'Todas las Pizzas',
    });

    expect(happyHoursRepository.update).toHaveBeenCalledWith(
      10,
      expect.objectContaining({
        promotionType: HappyHourPromotionType.DOSXUNO,
        promotionValue: null,
        appliesTo: 'Todas las Pizzas',
      }),
    );
  });

  it('limpia appliesTo cuando cambia de 2x1 a porcentaje aunque no se envíe en el PATCH', async () => {
    const { service, happyHoursRepository } = createService(
      HappyHourPromotionType.DOSXUNO,
    );

    await service.updateHappyHour(10, {
      promotionType: 'porcentaje',
      promotionValue: 15,
    });

    expect(happyHoursRepository.update).toHaveBeenCalledWith(
      10,
      expect.objectContaining({
        promotionType: HappyHourPromotionType.PORCENTAJE,
        promotionValue: 15,
        appliesTo: null,
      }),
    );
  });
});
