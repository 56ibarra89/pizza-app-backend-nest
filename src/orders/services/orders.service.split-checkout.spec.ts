import { BadRequestException, ConflictException } from '@nestjs/common';
import { OrderStatusDto } from '../dto/order-status.dto';
import { PaymentMethodDto } from '../dto/payment-method.dto';
import type { OrderEntity } from '../entities/order.entity';
import { OrdersService } from './orders.service';

describe('OrdersService split checkout safeguards', () => {
  const updatedAt = new Date('2026-10-24T12:00:00.000Z');
  const parentOrder: OrderEntity = {
    id: 'parent-order',
    items: [
      {
        id: 1,
        productId: 'pizza-1',
        name: 'Pizza',
        price: 100,
        size: 'mediana',
        quantity: 2,
        giftQuantity: 0,
        extras: [],
      },
    ],
    payments: [],
    subTotal: 200,
    discountAmount: 0,
    taxAmount: 30,
    total: 230,
    status: OrderStatusDto.pending,
    timestamp: new Date('2026-10-24T11:00:00.000Z'),
    updatedAt,
  };

  function createService(overrides?: {
    pricing?: Record<string, jest.Mock>;
    parent?: OrderEntity;
  }) {
    const repo = {
      findById: jest.fn().mockResolvedValue(overrides?.parent ?? parentOrder),
    };
    const pricing = {
      calculate: jest.fn().mockResolvedValue({
        subTotal: 100,
        discountAmount: 0,
        taxAmount: 15,
        total: 115,
      }),
      ...overrides?.pricing,
    };
    const service = new OrdersService(
      repo as never,
      { emit: jest.fn() } as never,
      pricing as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, repo, pricing };
  }

  it('rejects a custom/equal amount that differs from the authoritative item total', async () => {
    const { service } = createService();

    await expect(
      service.splitCheckout('parent-order', {
        mode: 'equal',
        accountName: 'Persona 1',
        subAccountAmount: 100,
        items: [
          {
            name: 'Pago parcial (Persona 1)',
            price: 100,
            size: 'único',
            quantity: 1,
            extras: [],
          },
        ],
        payments: [{ method: PaymentMethodDto.EFECTIVO, amount: 100 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a stale parent after acquiring its database row lock', async () => {
    const { service } = createService();
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([
        {
          id: parentOrder.id,
          status: 'PENDING',
          updatedAt: new Date(updatedAt.getTime() + 1_000),
        },
      ]),
    };

    await expect(
      (
        service as unknown as {
          lockUnchangedSplitParent(
            transaction: unknown,
            order: OrderEntity,
          ): Promise<void>;
        }
      ).lockUnchangedSplitParent(tx, parentOrder),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows locking a paid aggregate parent without an invoice for child cancellation', async () => {
    const { service } = createService();
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([
        {
          id: parentOrder.id,
          status: 'PAID',
          updatedAt,
          invoiceNumber: null,
        },
      ]),
    };

    await expect(
      (
        service as unknown as {
          lockUnchangedSplitParent(
            transaction: unknown,
            order: OrderEntity,
            allowSettledAggregate: boolean,
          ): Promise<void>;
        }
      ).lockUnchangedSplitParent(tx, parentOrder, true),
    ).resolves.toBeUndefined();
  });

  it('rejects gift quantities that are not available in the parent order', () => {
    const { service } = createService();

    expect(() =>
      (
        service as unknown as {
          subtractSubAccountItems(
            parentItems: OrderEntity['items'],
            subItems: OrderEntity['items'],
            nowMs: number,
          ): unknown;
        }
      ).subtractSubAccountItems(
        parentOrder.items,
        [{ ...parentOrder.items[0], quantity: 1, giftQuantity: 1 }],
        Date.now(),
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects switching to item split after an amount credit was recorded', async () => {
    const { service } = createService({
      parent: {
        ...parentOrder,
        items: [
          ...parentOrder.items,
          {
            id: 9,
            name: 'Abono subcuenta (Persona 1)',
            price: -50,
            size: 'único',
            quantity: 1,
            giftQuantity: 0,
            extras: [],
          },
        ],
      },
    });

    await expect(
      service.splitCheckout('parent-order', {
        mode: 'items',
        accountName: 'Persona 2',
        items: [
          {
            id: 1,
            productId: 'pizza-1',
            name: 'Pizza',
            price: 100,
            size: 'mediana',
            quantity: 1,
            extras: [],
          },
        ],
        payments: [{ method: PaymentMethodDto.EFECTIVO, amount: 115 }],
      }),
    ).rejects.toThrow(
      'No se puede cambiar a división por productos después de registrar abonos por monto.',
    );
  });

  it('rejects editing or deleting a recorded split credit', () => {
    const { service } = createService();
    const credit = {
      id: 9,
      name: 'Abono subcuenta (Persona 1)',
      price: -50,
      size: 'único',
      quantity: 1,
      giftQuantity: 0,
      extras: [],
    };
    const privateService = service as unknown as {
      assertSplitBillCreditsUnchanged(
        existing: OrderEntity['items'],
        incoming: OrderEntity['items'],
      ): void;
    };

    expect(() =>
      privateService.assertSplitBillCreditsUnchanged([credit], []),
    ).toThrow(BadRequestException);
    expect(() =>
      privateService.assertSplitBillCreditsUnchanged(
        [credit],
        [{ ...credit, quantity: 2 }],
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      privateService.assertSplitBillCreditsUnchanged([credit], [credit]),
    ).not.toThrow();
  });

  it('removes the matching parent credit when a custom split invoice is cancelled', async () => {
    const credit = {
      id: 9,
      name: 'Abono subcuenta (Persona 1)',
      price: -100,
      size: 'único',
      quantity: 1,
      giftQuantity: 0,
      extras: [],
    };
    const parentWithCredit: OrderEntity = {
      ...parentOrder,
      items: [...parentOrder.items, credit],
      total: 115,
    };
    const repo = { findById: jest.fn().mockResolvedValue(parentWithCredit) };
    const pricing = {
      resolvePromotion: jest.fn().mockResolvedValue({ source: 'none' }),
      normalizeComboItems: jest.fn((items: OrderEntity['items']) =>
        Promise.resolve(items),
      ),
      calculateWithPrices: jest.fn((items: OrderEntity['items']) =>
        Promise.resolve({
          items,
          totals: {
            subTotal: 200,
            discountAmount: 0,
            taxAmount: 30,
            total: 230,
          },
        }),
      ),
    };
    const service = new OrdersService(
      repo as never,
      { emit: jest.fn() } as never,
      pricing as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const child: OrderEntity = {
      ...parentOrder,
      id: 'child-order',
      parentOrderId: parentOrder.id,
      splitAccountName: 'Persona 1',
      splitMode: 'custom',
      status: OrderStatusDto.paid,
    };

    const restore = await (
      service as unknown as {
        prepareSplitCancellationRestore(order: OrderEntity): Promise<{
          update: { items?: OrderEntity['items'] };
        }>;
      }
    ).prepareSplitCancellationRestore(child);

    expect(restore.update.items).toEqual(parentOrder.items);
  });

  it('uses the paid child amount to disambiguate repeated split account names', async () => {
    const firstCredit = {
      id: 9,
      name: 'Abono subcuenta (Persona 1)',
      price: -150,
      size: 'único',
      quantity: 1,
      giftQuantity: 0,
      extras: [],
    };
    const secondCredit = { ...firstCredit, id: 10, price: -200 };
    const parentWithRepeatedName: OrderEntity = {
      ...parentOrder,
      status: OrderStatusDto.paid,
      items: [...parentOrder.items, firstCredit, secondCredit],
      total: 0,
    };
    const repo = {
      findById: jest.fn().mockResolvedValue(parentWithRepeatedName),
    };
    const pricing = {
      resolvePromotion: jest.fn().mockResolvedValue({ source: 'none' }),
      normalizeComboItems: jest.fn((items: OrderEntity['items']) =>
        Promise.resolve(items),
      ),
      calculateWithPrices: jest.fn((items: OrderEntity['items']) =>
        Promise.resolve({
          items,
          totals: {
            subTotal: 50,
            discountAmount: 0,
            taxAmount: 7.5,
            total: 57.5,
          },
        }),
      ),
    };
    const service = new OrdersService(
      repo as never,
      { emit: jest.fn() } as never,
      pricing as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const firstChild: OrderEntity = {
      ...parentOrder,
      id: 'child-order',
      parentOrderId: parentOrder.id,
      splitAccountName: 'Persona 1',
      splitMode: 'custom',
      status: OrderStatusDto.paid,
      subTotal: 150,
      total: 172.5,
    };

    const restore = await (
      service as unknown as {
        prepareSplitCancellationRestore(order: OrderEntity): Promise<{
          update: { items?: OrderEntity['items']; paidAt?: Date | null };
        }>;
      }
    ).prepareSplitCancellationRestore(firstChild);

    expect(restore.update.items).toEqual([...parentOrder.items, secondCredit]);
    expect(restore.update.paidAt).toBeNull();
  });

  it('consumes the parent coupon and sends unsent parent kitchen items when the final amount split settles the table', async () => {
    const parentWithCoupon: OrderEntity = {
      ...parentOrder,
      cuponId: 7,
      subTotal: 100,
      discountAmount: 20,
      taxAmount: 12,
      total: 92,
      items: [
        {
          ...parentOrder.items[0],
          quantity: 1,
          isSentToKitchen: false,
        },
      ],
    };
    const repo = {
      findById: jest
        .fn()
        .mockResolvedValueOnce(parentWithCoupon)
        .mockResolvedValueOnce({
          ...parentWithCoupon,
          id: 'child-final',
          status: OrderStatusDto.paid,
          cuponId: 7,
          invoice: { invoiceNumber: 'OCT26-00099' },
        }),
      update: jest.fn().mockImplementation((_id: string, data: unknown) =>
        Promise.resolve({
          ...parentWithCoupon,
          ...(data as Record<string, unknown>),
        }),
      ),
      create: jest.fn().mockResolvedValue({ id: 'child-final' }),
    };
    const pricing = {
      calculate: jest.fn().mockResolvedValue({
        subTotal: 80,
        discountAmount: 0,
        taxAmount: 12,
        total: 92,
      }),
      normalizeComboItems: jest.fn((items: OrderEntity['items']) =>
        Promise.resolve(items),
      ),
      resolvePromotion: jest
        .fn()
        .mockImplementation(
          (_input: unknown, fallback?: { cuponId?: number }) =>
            Promise.resolve(
              fallback?.cuponId
                ? { source: 'coupon', cuponId: fallback.cuponId }
                : { source: 'none' },
            ),
        ),
      calculateWithPrices: jest
        .fn()
        .mockImplementation(
          (items: OrderEntity['items'], promotion: { source: string }) =>
            Promise.resolve(
              promotion.source === 'coupon'
                ? {
                    items,
                    totals: {
                      subTotal: 20,
                      discountAmount: 20,
                      taxAmount: 0,
                      total: 0,
                    },
                  }
                : {
                    items,
                    totals: {
                      subTotal: 80,
                      discountAmount: 0,
                      taxAmount: 12,
                      total: 92,
                    },
                  },
            ),
        ),
    };
    const finalization = {
      issueInTransaction: jest.fn().mockResolvedValue(undefined),
    };
    const referenceResolver = {
      resolve: jest.fn().mockResolvedValue({
        customerId: undefined,
        cashierId: 'cashier-1',
        shiftId: 'shift-1',
      }),
    };
    const prisma = {
      appConfig: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest.fn(
        <T>(callback: (tx: unknown) => Promise<T>): Promise<T> =>
          callback({
            $queryRaw: jest.fn().mockResolvedValue([
              {
                id: parentWithCoupon.id,
                status: 'PENDING',
                updatedAt,
                invoiceNumber: null,
              },
            ]),
            order: { count: jest.fn().mockResolvedValue(0) },
          }),
      ),
    };
    const service = new OrdersService(
      repo as never,
      { emit: jest.fn() } as never,
      pricing as never,
      finalization as never,
      {} as never,
      referenceResolver as never,
      {} as never,
      {} as never,
      {} as never,
      prisma as never,
    );

    await service.splitCheckout('parent-order', {
      mode: 'equal',
      accountName: 'Persona 2',
      subAccountAmount: 92,
      items: [
        {
          name: 'Pago parcial (Persona 2)',
          price: 80,
          size: 'único',
          quantity: 1,
          extras: [],
        },
      ],
      payments: [{ method: 'EFECTIVO' as never, amount: 92 }],
    });

    const parentUpdateCall = repo.update.mock.calls[0] as [
      string,
      {
        status?: OrderStatusDto;
        paidAt?: Date | null;
        isSentToKitchen?: boolean;
        items?: OrderEntity['items'];
      },
    ];
    expect(parentUpdateCall[0]).toBe('parent-order');
    expect(parentUpdateCall[1].status).toBe(OrderStatusDto.paid);
    expect(parentUpdateCall[1].paidAt).toBeInstanceOf(Date);
    expect(parentUpdateCall[1].isSentToKitchen).toBe(true);
    expect(parentUpdateCall[1].items?.[0]).toMatchObject({
      name: 'Pizza',
      isSentToKitchen: true,
      kitchenStatus: 'pending',
    });
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        cuponId: 7,
        parentOrderId: 'parent-order',
      }),
      expect.anything(),
    );
    expect(finalization.issueInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orderId: 'child-final',
        promotion: { source: 'coupon', cuponId: 7 },
        skipCouponConsumption: false,
      }),
    );
  });
});
