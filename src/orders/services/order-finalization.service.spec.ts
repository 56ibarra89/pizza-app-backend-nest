import { DocumentType, CorrelativoStatus } from '@prisma/client';
import { OrderFinalizationService } from './order-finalization.service';
import type { OrderEntity } from '../entities/order.entity';
import { OrderStatusDto } from '../dto/order-status.dto';
import { OrderTypeDto } from '../dto/order-type.dto';
import { OrderPromotionSourceDto } from '../dto/order-promotion-source.dto';

function makeOrder(overrides: Partial<OrderEntity> = {}): OrderEntity {
  return {
    id: 'order-1',
    shiftId: 'shift-1',
    items: [
      {
        id: 1,
        productId: 'prod-1',
        name: 'Pizza Margarita',
        price: 100,
        size: 'mediana',
        quantity: 1,
        giftQuantity: 0,
        extras: [],
      },
    ],
    subTotal: 100,
    discountAmount: 0,
    taxAmount: 15,
    total: 115,
    timestamp: new Date('2026-11-10T18:00:00.000Z'),
    updatedAt: new Date('2026-11-10T18:00:00.000Z'),
    status: OrderStatusDto.ready,
    orderType: OrderTypeDto.local,
    isSentToKitchen: true,
    payments: [],
    linkedTables: [],
    cuponId: undefined,
    discountId: undefined,
    happyHourId: undefined,
    ...overrides,
  };
}

describe('OrderFinalizationService — B23 & B24', () => {
  it('applies a newly selected discount in finalize even when untouched order had discountAmount = 0 (B23)', async () => {
    const order = makeOrder({ discountAmount: 0, cuponId: undefined });
    const promotion = {
      source: 'discount' as const,
      discountId: 4,
      rule: {} as never,
    };
    const pricing = {
      resolvePromotion: jest.fn().mockResolvedValue(promotion),
      calculateWithPrices: jest.fn().mockResolvedValue({
        items: order.items,
        totals: {
          subTotal: 100,
          discountAmount: 10,
          taxAmount: 13.5,
          total: 103.5,
        },
      }),
    };
    const invoiceIssuing = {
      issue: jest.fn().mockResolvedValue(undefined),
    };
    const prisma = {
      order: { count: jest.fn().mockResolvedValue(0) },
      $transaction: jest
        .fn()
        .mockImplementation((cb: (tx: unknown) => Promise<void>) => cb({})),
    };

    const service = new OrderFinalizationService(
      prisma as never,
      pricing as never,
      invoiceIssuing as never,
    );

    await service.finalize(order, {
      expectedUpdatedAt: '2026-11-10T17:59:00.000Z',
      promotionSource: OrderPromotionSourceDto.discount,
      discountId: 4,
      payments: [{ method: 'EFECTIVO' as never, amount: 103.5 }],
    });

    expect(pricing.calculateWithPrices).toHaveBeenCalledTimes(1);
    expect(pricing.calculateWithPrices).toHaveBeenCalledWith(
      order.items,
      promotion,
      undefined,
      { useSnapshotPrices: true },
    );
    expect(invoiceIssuing.issue).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        totals: expect.objectContaining({
          discountAmount: 10,
          total: 103.5,
        }),
        skipCouponConsumption: false,
        expectedUpdatedAt: new Date('2026-11-10T17:59:00.000Z'),
      }),
    );
  });

  it('removes a stored promotion when finalize passes promotionSource = none on an untouched order (B23)', async () => {
    const order = makeOrder({ cuponId: 7, discountAmount: 20, total: 92 });
    const pricing = {
      resolvePromotion: jest.fn().mockResolvedValue({ source: 'none' }),
      calculateWithPrices: jest.fn().mockResolvedValue({
        items: order.items,
        totals: {
          subTotal: 100,
          discountAmount: 0,
          taxAmount: 15,
          total: 115,
        },
      }),
    };
    const invoiceIssuing = {
      issue: jest.fn().mockResolvedValue(undefined),
    };
    const prisma = {
      order: { count: jest.fn().mockResolvedValue(0) },
      $transaction: jest
        .fn()
        .mockImplementation((cb: (tx: unknown) => Promise<void>) => cb({})),
    };

    const service = new OrderFinalizationService(
      prisma as never,
      pricing as never,
      invoiceIssuing as never,
    );

    await service.finalize(order, {
      promotionSource: OrderPromotionSourceDto.none,
      payments: [{ method: 'EFECTIVO' as never, amount: 115 }],
    });

    expect(pricing.calculateWithPrices).toHaveBeenCalledTimes(1);
    expect(invoiceIssuing.issue).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        totals: expect.objectContaining({
          discountAmount: 0,
          total: 115,
        }),
      }),
    );
  });

  it('finalizes split parent without failing when a prior split child already consumed the single-use coupon (B24)', async () => {
    const order = makeOrder({
      cuponId: 9,
      discountAmount: 0,
      items: [
        {
          id: 1,
          productId: 'prod-1',
          name: 'Pizza Margarita',
          price: 100,
          size: 'mediana',
          quantity: 1,
          giftQuantity: 0,
          extras: [],
        },
        {
          name: 'Abono subcuenta (Persona 1)',
          price: -50,
          size: 'único',
          quantity: 1,
          giftQuantity: 0,
          extras: [],
        },
      ],
    });
    const promotion = { source: 'coupon' as const, cuponId: 9 };
    const pricing = {
      resolvePromotion: jest.fn().mockResolvedValue(promotion),
      calculateWithPrices: jest
        .fn()
        .mockImplementation(
          async (
            items: OrderEntity['items'],
            _promo: unknown,
            overrideDiscount?: number,
          ) => {
            if (overrideDiscount === undefined) {
              throw new Error('Cupón no válido: Agotado');
            }
            return {
              items,
              totals: {
                subTotal: 50,
                discountAmount: overrideDiscount,
                taxAmount: 7.5,
                total: 57.5,
              },
            };
          },
        ),
    };
    const invoiceIssuing = {
      issue: jest.fn().mockResolvedValue(undefined),
    };
    const prisma = {
      order: {
        // Simula hijo dividido PAID con couponConsumptionRecorded = true
        count: jest.fn().mockResolvedValue(1),
      },
      $transaction: jest
        .fn()
        .mockImplementation((cb: (tx: unknown) => Promise<void>) => cb({})),
    };

    const service = new OrderFinalizationService(
      prisma as never,
      pricing as never,
      invoiceIssuing as never,
    );

    await service.finalize(order, {
      payments: [{ method: 'EFECTIVO' as never, amount: 57.5 }],
    });

    expect(pricing.calculateWithPrices).toHaveBeenCalledTimes(1);
    expect(pricing.calculateWithPrices).toHaveBeenCalledWith(
      order.items,
      promotion,
      0,
      { useSnapshotPrices: true },
    );
    expect(invoiceIssuing.issue).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        skipCouponConsumption: true,
        totals: expect.objectContaining({
          discountAmount: 0,
          total: 57.5,
        }),
      }),
    );
    // Keep unused imports checked by TS
    expect(DocumentType.FACTURA).toBeDefined();
    expect(CorrelativoStatus.ACTIVO).toBeDefined();
  });
});
