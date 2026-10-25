import { BadRequestException, ConflictException } from '@nestjs/common';
import { OrderStatusDto } from '../dto/order-status.dto';
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
        payments: [{ method: 'EFECTIVO', amount: 100 }],
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
        payments: [{ method: 'EFECTIVO', amount: 115 }],
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
    const validate = (
      service as unknown as {
        assertSplitBillCreditsUnchanged(
          existing: OrderEntity['items'],
          incoming: OrderEntity['items'],
        ): void;
      }
    ).assertSplitBillCreditsUnchanged.bind(service);

    expect(() => validate([credit], [])).toThrow(BadRequestException);
    expect(() => validate([credit], [{ ...credit, quantity: 2 }])).toThrow(
      BadRequestException,
    );
    expect(() => validate([credit], [credit])).not.toThrow();
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
      normalizeComboItems: jest.fn(async (items) => items),
      calculateWithPrices: jest.fn(async (items) => ({
        items,
        totals: {
          subTotal: 200,
          discountAmount: 0,
          taxAmount: 30,
          total: 230,
        },
      })),
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
});
