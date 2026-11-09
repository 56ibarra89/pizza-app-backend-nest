import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  CertificadoStatus,
  CorrelativoStatus,
  DocumentType,
  Prisma,
  ShiftStatus,
} from '@prisma/client';
import { PrismaCashExpensesRepository } from '../../cash-expenses/repositories/prisma-cash-expenses.repository';
import { PrismaCorrelativosRepository } from '../../correlativos/repositories/prisma-correlativos.repository';
import { UserRoleDto } from '../../common';
import { OrderStatusDto } from '../dto/order-status.dto';
import { OrderTypeDto } from '../dto/order-type.dto';
import { PaymentMethodDto } from '../dto/payment-method.dto';
import type { OrderEntity } from '../entities/order.entity';
import { PrismaOrdersRepository } from '../repositories/prisma-orders.repository';
import { InvoiceIssuingService } from './invoice-issuing.service';
import { OrderPricingService } from './order-pricing.service';
import { OrdersService } from './orders.service';

describe('Phase 1 critical integrity safeguards (H01 & H02)', () => {
  describe('H01 — Certificate and gift quantity validation', () => {
    function createPricingService() {
      const productsService = {
        getProductById: jest.fn().mockResolvedValue({
          id: 'prod-1',
          name: 'Pizza Margarita',
          categoryId: 'cat-1',
          isCombo: false,
          prices: [{ size: 'mediana', price: 100 }],
          extras: [],
        }),
      };
      const appConfigService = {
        getByIdOrDefault: jest
          .fn()
          .mockImplementation((key: string) =>
            key === 'packaging_sizes'
              ? Promise.resolve({ data: { sizes: [] } })
              : Promise.resolve({
                  data: { isExonerated: false, taxes: [{ percentage: 15 }] },
                }),
          ),
      };
      return new OrderPricingService(
        productsService as never,
        appConfigService as never,
        {} as never,
        {} as never,
        {} as never,
      );
    }

    it('rejects a gifted item with an empty "Vale:" note in OrderPricingService.calculateWithPrices', async () => {
      const pricing = createPricingService();

      await expect(
        pricing.calculateWithPrices([
          {
            productId: 'prod-1',
            name: 'Pizza Margarita',
            price: 100,
            size: 'mediana',
            quantity: 1,
            giftQuantity: 1,
            note: 'Vale:   ',
            extras: [],
          },
        ]),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects negative or excessive giftQuantity in OrderPricingService.calculateWithPrices', async () => {
      const pricing = createPricingService();

      await expect(
        pricing.calculateWithPrices([
          {
            productId: 'prod-1',
            name: 'Pizza Margarita',
            price: 100,
            size: 'mediana',
            quantity: 1,
            giftQuantity: 2,
            note: 'Vale: CERT-01',
            extras: [],
          },
        ]),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects empty "Vale:" notes in OrdersService.extractCertificateSerials', () => {
      const service = new OrdersService(
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      );
      const extract = (
        service as unknown as {
          extractCertificateSerials: (items: OrderEntity['items']) => string[];
        }
      ).extractCertificateSerials.bind(service);

      expect(() =>
        extract([
          {
            productId: 'prod-1',
            name: 'Pizza Margarita',
            price: 100,
            size: 'mediana',
            quantity: 1,
            giftQuantity: 1,
            note: 'Vale:',
            extras: [],
          },
        ]),
      ).toThrow(BadRequestException);

      expect(
        extract([
          {
            productId: 'prod-1',
            name: 'Pizza Margarita',
            price: 100,
            size: 'mediana',
            quantity: 1,
            giftQuantity: 1,
            note: 'Vale: cert-100 ',
            extras: [],
          },
        ]),
      ).toEqual(['CERT-100']);
    });

    it('validates product and quantity correspondence in assertPendingBenefitsAvailable', async () => {
      const prisma = {
        certificado: {
          findMany: jest.fn().mockResolvedValue([
            {
              serial: 'CERT-100',
              status: CertificadoStatus.DISPONIBLE,
              amount: null,
              items: [{ productId: 'prod-1', quantity: 1 }],
            },
          ]),
        },
        order: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      };
      const service = new OrdersService(
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        prisma as never,
      );
      const assertBenefits = (
        service as unknown as {
          assertPendingBenefitsAvailable: (params: {
            certificateSerials: readonly string[];
            items?: OrderEntity['items'];
          }) => Promise<void>;
        }
      ).assertPendingBenefitsAvailable.bind(service);

      await expect(
        assertBenefits({
          certificateSerials: ['CERT-100'],
          items: [
            {
              productId: 'prod-1',
              name: 'Pizza Margarita',
              price: 100,
              size: 'mediana',
              quantity: 2,
              giftQuantity: 2,
              note: 'Vale: CERT-100',
              extras: [],
            },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects uncertified gifted items in InvoiceIssuingService even when dto.certificateSerials is empty', async () => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValueOnce([{ id: 'order-1' }]),
        order: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'order-1',
            status: 'PENDING',
            cashierId: 'cashier-1',
            cashierSnapshotName: 'Caja',
            shiftId: 'shift-1',
            invoiceNumber: 'FAC-1',
            pendingCertificateSerials: null,
          }),
          update: jest.fn(),
        },
        shift: { findFirst: jest.fn().mockResolvedValue({ id: 'shift-1' }) },
        orderItem: {
          findMany: jest.fn().mockResolvedValue([
            {
              productId: 'prod-1',
              name: 'Pizza Margarita',
              note: 'Vale: ',
              giftQuantity: 1,
              giftReason: null,
              price: new Prisma.Decimal(100),
            },
          ]),
        },
      };

      await expect(
        new InvoiceIssuingService().issue(tx as never, {
          orderId: 'order-1',
          dto: {},
          totals: { subTotal: 0, discountAmount: 0, taxAmount: 0, total: 0 },
          promotion: { source: 'none' },
        }),
      ).rejects.toThrow(BadRequestException);
      expect(tx.order.update).not.toHaveBeenCalled();
    });
  });

  describe('H02 — Commercial immutability of paid and cancelled orders', () => {
    const paidOrder: OrderEntity = {
      id: 'order-paid-1',
      status: OrderStatusDto.paid,
      total: 115,
      subTotal: 100,
      discountAmount: 0,
      taxAmount: 15,
      timestamp: new Date('2026-10-24T12:00:00.000Z'),
      payments: [],
      items: [
        {
          id: 10,
          productId: 'prod-1',
          name: 'Pizza Margarita',
          price: 100,
          size: 'mediana',
          quantity: 1,
          giftQuantity: 0,
          extras: [],
          isSentToKitchen: false,
        },
      ],
    };

    function createOrdersServiceForOrder(order: OrderEntity) {
      const repo = {
        findById: jest.fn().mockResolvedValue(order),
        update: jest
          .fn()
          .mockImplementation((_id: string, data: { items: unknown }) =>
            Promise.resolve({ ...order, items: data.items }),
          ),
      };
      const service = new OrdersService(
        repo as never,
        { emit: jest.fn() } as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      );
      return { service, repo };
    }

    it('rejects emptying items on a paid order (items: [])', async () => {
      const { service, repo } = createOrdersServiceForOrder(paidOrder);

      await expect(
        service.updateItems(paidOrder.id, { items: [] }),
      ).rejects.toThrow(
        'No se puede modificar el contenido comercial de una orden facturada.',
      );
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('rejects adding, removing, or changing quantities/products on a paid order', async () => {
      const { service, repo } = createOrdersServiceForOrder(paidOrder);

      await expect(
        service.updateItems(paidOrder.id, {
          items: [
            {
              ...paidOrder.items[0],
              quantity: 2,
            },
          ],
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.updateItems(paidOrder.id, {
          items: [
            paidOrder.items[0],
            {
              productId: 'prod-2',
              name: 'Refresco',
              price: 30,
              size: 'único',
              quantity: 1,
              extras: [],
            },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('rejects any item update on a cancelled order', async () => {
      const { service, repo } = createOrdersServiceForOrder({
        ...paidOrder,
        status: OrderStatusDto.cancelled,
      });

      await expect(
        service.updateItems(paidOrder.id, { items: paidOrder.items }),
      ).rejects.toThrow(
        'No se pueden modificar los productos de una orden anulada.',
      );
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('allows operational kitchen state updates on a paid order while preserving commercial fields', async () => {
      const { service, repo } = createOrdersServiceForOrder(paidOrder);

      const result = await service.updateItems(paidOrder.id, {
        isSentToKitchen: true,
        items: [
          {
            ...paidOrder.items[0],
            price: 999, // attempted price tampering must be ignored because commercial fields come from prev
            isSentToKitchen: true,
            sentAt: 1700000000000,
          },
        ],
      });

      expect(repo.update).toHaveBeenCalledTimes(1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        id: 10,
        productId: 'prod-1',
        name: 'Pizza Margarita',
        price: 100,
        quantity: 1,
        isSentToKitchen: true,
        sentAt: 1700000000000,
      });
    });

    it('prevents deleteMany and create in PrismaOrdersRepository.update when status is paid', async () => {
      let capturedUpdateArgs: { data?: { items?: Record<string, unknown> } } =
        {};
      const prisma = {
        orderItem: {
          findMany: jest.fn().mockResolvedValue([{ id: 10, extras: [] }]),
        },
        order: {
          update: jest.fn().mockImplementation((args: typeof capturedUpdateArgs) => {
            capturedUpdateArgs = args;
            return Promise.resolve({
              id: paidOrder.id,
              status: 'PAID',
              total: new Prisma.Decimal(115),
              subTotal: new Prisma.Decimal(100),
              discountAmount: new Prisma.Decimal(0),
              taxAmount: new Prisma.Decimal(15),
              timestamp: paidOrder.timestamp,
              updatedAt: paidOrder.timestamp,
              isSentToKitchen: true,
              payments: [],
              items: [],
              linkedTables: [],
            });
          }),
        },
      };
      const repository = new PrismaOrdersRepository(prisma as never);

      await repository.update(paidOrder.id, {
        status: OrderStatusDto.paid,
        items: paidOrder.items,
      });

      expect(capturedUpdateArgs.data?.items).toBeDefined();
      expect(capturedUpdateArgs.data?.items).not.toHaveProperty('deleteMany');
      expect(capturedUpdateArgs.data?.items).not.toHaveProperty('create');
      expect(capturedUpdateArgs.data?.items).toHaveProperty('update');
    });
  });

  describe('H07 & H08 — Order finalization permission and resource-level authorization', () => {
    const baseDeliveryOrder: OrderEntity = {
      id: 'order-del-1',
      status: OrderStatusDto.ready,
      orderType: OrderTypeDto.delivery,
      driverId: 'driver-assigned',
      total: 115,
      subTotal: 100,
      discountAmount: 0,
      taxAmount: 15,
      timestamp: new Date('2026-10-24T12:00:00.000Z'),
      payments: [{ method: PaymentMethodDto.EFECTIVO, amount: 115 }],
      items: [
        {
          id: 1,
          productId: 'prod-1',
          name: 'Pizza Margarita',
          price: 100,
          size: 'mediana',
          quantity: 1,
          giftQuantity: 0,
          kitchenId: 'kitchen-horno',
          isSentToKitchen: true,
          kitchenStatus: 'ready' as never,
          extras: [],
        },
      ],
    };

    it('rejects creating an immediately paid order when user lacks orders.finalize (H07)', async () => {
      const repo = { create: jest.fn() };
      const prisma = {
        appConfig: { findUnique: jest.fn().mockResolvedValue(null) },
      };
      const service = new OrdersService(
        repo as never,
        { emit: jest.fn() } as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        prisma as never,
      );

      await expect(
        service.create(
          {
            items: baseDeliveryOrder.items,
            payments: [{ method: PaymentMethodDto.EFECTIVO, amount: 115 }],
          },
          {
            id: 'user-mesero',
            username: 'mesero1',
            role: UserRoleDto.mesero,
            permissions: ['orders.manage'],
          },
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('rejects transitioning an order to paid via updateStatus when user lacks orders.finalize (H07)', async () => {
      const repo = {
        findById: jest.fn().mockResolvedValue({
          ...baseDeliveryOrder,
          orderType: OrderTypeDto.local,
        }),
      };
      const service = new OrdersService(
        repo as never,
        { emit: jest.fn() } as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      );

      await expect(
        service.updateStatus(
          baseDeliveryOrder.id,
          { status: OrderStatusDto.paid },
          {
            id: 'user-mesero',
            username: 'mesero1',
            role: UserRoleDto.mesero,
            permissions: ['orders.status'],
          },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects motorizado finalizing, updating, or starting delivery on unassigned or other driver orders (H08)', async () => {
      const repo = {
        findById: jest.fn().mockResolvedValue({
          ...baseDeliveryOrder,
          driverId: undefined,
        }),
        update: jest.fn(),
      };
      const service = new OrdersService(
        repo as never,
        { emit: jest.fn() } as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        { $transaction: jest.fn(async (fn) => fn({ $queryRaw: jest.fn().mockResolvedValue([{ id: baseDeliveryOrder.id }]) })) } as never,
      );
      const motorizadoUser = {
        id: 'driver-other',
        username: 'moto2',
        role: UserRoleDto.motorizado,
        permissions: ['delivery.read', 'orders.status', 'orders.finalize'],
      };

      await expect(
        service.startDelivery(baseDeliveryOrder.id, motorizadoUser),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.updateStatus(
          baseDeliveryOrder.id,
          { status: OrderStatusDto.delivered },
          motorizadoUser,
        ),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.finalize(
          baseDeliveryOrder.id,
          { payments: baseDeliveryOrder.payments },
          motorizadoUser,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects cocinero updating status on an order with no items in their assigned kitchen (H08)', async () => {
      const repo = {
        findById: jest.fn().mockResolvedValue(baseDeliveryOrder),
        updateItemsKitchenStatus: jest.fn(),
      };
      const kitchens = {
        getAssignedKitchenIdForDate: jest
          .fn()
          .mockResolvedValue('kitchen-bebidas'),
      };
      const service = new OrdersService(
        repo as never,
        { emit: jest.fn() } as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        kitchens as never,
        {} as never,
      );

      await expect(
        service.updateStatus(
          baseDeliveryOrder.id,
          {
            status: OrderStatusDto.preparing,
            sentAt: 1700000000000,
            kitchenId: 'kitchen-bebidas',
          },
          {
            id: 'cook-1',
            username: 'cocinero1',
            role: UserRoleDto.cocinero,
            permissions: ['orders.status'],
          },
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(repo.updateItemsKitchenStatus).not.toHaveBeenCalled();
    });
  });

  describe('Phase 3 — Monetary and concurrency guarantees (H04, H05, H06, H15, H24, H28)', () => {
    it('rejects concurrent edit vs finalization when updatedAt or status changed under row lock (H04)', async () => {
      const staleTime = new Date('2026-10-24T12:00:00.000Z');
      const newerTime = new Date('2026-10-24T12:01:00.000Z');

      await expect(
        new InvoiceIssuingService().issue(
          {
            $queryRaw: jest
              .fn()
              .mockResolvedValue([{ id: 'order-1', updatedAt: newerTime }]),
          } as never,
          {
            orderId: 'order-1',
            dto: {},
            totals: { subTotal: 100, discountAmount: 0, taxAmount: 15, total: 115 },
            expectedUpdatedAt: staleTime,
            promotion: { source: 'none' },
          },
        ),
      ).rejects.toThrow(ConflictException);

      const repo = {
        findById: jest.fn().mockResolvedValue({
          id: 'order-1',
          status: OrderStatusDto.pending,
          updatedAt: staleTime,
          total: 115,
          timestamp: staleTime,
          payments: [],
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
        }),
        update: jest.fn(),
      };
      const pricing = {
        normalizeComboItems: jest.fn((items: unknown) => Promise.resolve(items)),
        resolvePromotion: jest.fn().mockResolvedValue({ source: 'none' }),
        calculateWithPrices: jest.fn((items: unknown) =>
          Promise.resolve({
            items,
            totals: { subTotal: 100, discountAmount: 0, taxAmount: 15, total: 115 },
          }),
        ),
      };
      const prisma = {
        $transaction: jest.fn((cb: (tx: unknown) => unknown) =>
          cb({
            $queryRaw: jest
              .fn()
              .mockResolvedValue([{ id: 'order-1', status: 'PAID', updatedAt: newerTime }]),
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
        prisma as never,
      );

      await expect(
        service.updateItems('order-1', {
          items: [
            {
              id: 1,
              productId: 'prod-1',
              name: 'Pizza Margarita',
              price: 100,
              size: 'mediana',
              quantity: 1,
              extras: [],
            },
          ],
        }),
      ).rejects.toThrow(ConflictException);
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('locks the shift row and rejects expenses if the shift closed or exceeded unauthenticated limit concurrently (H05)', async () => {
      const closedShiftPrisma = {
        $transaction: jest.fn((cb: (tx: unknown) => unknown) =>
          cb({
            $queryRaw: jest
              .fn()
              .mockResolvedValue([{ id: 'shift-1', status: ShiftStatus.CLOSED }]),
            cashExpense: { create: jest.fn() },
          }),
        ),
      };
      const closedRepo = new PrismaCashExpensesRepository(
        closedShiftPrisma as never,
      );

      await expect(
        closedRepo.create({
          shiftId: 'shift-1',
          amount: 100,
          category: 'INSUMOS' as never,
          reason: 'Compra hielo',
          cashierSnapshotName: 'caja1',
        }),
      ).rejects.toThrow(BadRequestException);

      const exceededLimitPrisma = {
        $transaction: jest.fn((cb: (tx: unknown) => unknown) =>
          cb({
            $queryRaw: jest
              .fn()
              .mockResolvedValue([{ id: 'shift-1', status: ShiftStatus.OPEN }]),
            cashExpense: {
              aggregate: jest.fn().mockResolvedValue({
                _sum: { amount: new Prisma.Decimal(1450) },
              }),
              create: jest.fn(),
            },
          }),
        ),
      };
      const exceededRepo = new PrismaCashExpensesRepository(
        exceededLimitPrisma as never,
      );

      await expect(
        exceededRepo.create({
          shiftId: 'shift-1',
          amount: 100,
          category: 'INSUMOS' as never,
          reason: 'Compra hielo',
          cashierSnapshotName: 'caja1',
          maxShiftTotalWithoutAuth: 1500,
          hasAuthorization: false,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects expired correlativos and uses configured startNumber when auto-creating or consuming (H06)', async () => {
      const pastDate = new Date('2025-01-01T00:00:00.000Z');
      const txExpired = {
        $queryRaw: jest
          .fn()
          .mockResolvedValueOnce([{ id: 'order-1' }])
          .mockResolvedValueOnce([{ id: 'corr-expired' }]),
        order: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'order-1',
            status: 'PENDING',
            cashierId: 'c-1',
            cashierSnapshotName: 'Caja',
            invoiceNumber: null,
            pendingCertificateSerials: null,
          }),
          update: jest.fn(),
        },
        shift: { findFirst: jest.fn().mockResolvedValue({ id: 'shift-1' }) },
        correlativo: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'corr-expired',
            prefix: 'F-',
            startNumber: 100,
            currentNumber: 100,
            endNumber: 999,
            expirationDate: pastDate,
            status: CorrelativoStatus.ACTIVO,
            resolutionNumber: 'RES-1',
          }),
          update: jest.fn().mockResolvedValue({}),
        },
      };

      await expect(
        new InvoiceIssuingService().issue(txExpired as never, {
          orderId: 'order-1',
          dto: {},
          totals: { subTotal: 100, discountAmount: 0, taxAmount: 15, total: 115 },
          promotion: { source: 'none' },
        }),
      ).rejects.toThrow('El correlativo está VENCIDO');
      expect(txExpired.correlativo.update).toHaveBeenCalledWith({
        where: { id: 'corr-expired' },
        data: { status: CorrelativoStatus.VENCIDO },
      });

      const corrRepo = new PrismaCorrelativosRepository({
        $transaction: jest.fn((cb: (tx: unknown) => unknown) =>
          cb({
            $queryRaw: jest.fn().mockResolvedValue([{ id: 'corr-1' }]),
            correlativo: {
              findUnique: jest.fn().mockResolvedValue({
                id: 'corr-1',
                documentType: DocumentType.FACTURA,
                resolutionNumber: 'RES-2',
                prefix: 'F-',
                startNumber: 500,
                endNumber: 1000,
                currentNumber: 1,
                issueDate: new Date(),
                expirationDate: new Date(Date.now() + 86_400_000),
                status: CorrelativoStatus.ACTIVO,
              }),
              update: jest.fn(),
            },
          }),
        ),
      } as never);

      await expect(
        corrRepo.consumeNext(DocumentType.FACTURA),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects inconsistent originalAmount/exchangeRate and prevents altering non-cash payments in split reconciliation (H15)', async () => {
      const prisma = {
        appConfig: { findUnique: jest.fn().mockResolvedValue(null) },
      };
      const service = new OrdersService(
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        prisma as never,
      );
      const resolvePayments = (
        service as unknown as {
          resolvePayments: (
            payments: Array<Record<string, unknown>>,
          ) => Promise<unknown>;
        }
      ).resolvePayments.bind(service);

      await expect(
        resolvePayments([
          {
            method: PaymentMethodDto.TARJETA,
            reference: 'AUTH1234',
            amount: 101,
            originalAmount: 100,
          },
        ]),
      ).rejects.toThrow(BadRequestException);

      const reconcileSplitPayments = (
        service as unknown as {
          reconcileSplitPayments: (
            payments: Array<{
              method: PaymentMethodDto;
              amount: number;
              originalAmount?: number;
            }>,
            targetTotal: number,
            clientTotal?: number,
          ) => Array<{
            method: PaymentMethodDto;
            amount: number;
            originalAmount?: number;
          }>;
        }
      ).reconcileSplitPayments.bind(service);

      // Card payment is never altered even for a 0.01 difference, and >0.01 is never altered even for cash
      expect(
        reconcileSplitPayments(
          [{ method: PaymentMethodDto.TARJETA, amount: 100, originalAmount: 100 }],
          100.01,
          100,
        ),
      ).toEqual([
        { method: PaymentMethodDto.TARJETA, amount: 100, originalAmount: 100 },
      ]);

      expect(
        reconcileSplitPayments(
          [{ method: PaymentMethodDto.EFECTIVO, amount: 100, originalAmount: 100 }],
          100.5,
          100,
        ),
      ).toEqual([
        { method: PaymentMethodDto.EFECTIVO, amount: 100, originalAmount: 100 },
      ]);
    });

    it('preserves persisted item snapshot prices during finalization even if catalog prices change later (H28)', async () => {
      const productsService = {
        getProductById: jest.fn().mockResolvedValue({
          id: 'prod-1',
          name: 'Pizza Margarita',
          categoryId: 'cat-1',
          isCombo: false,
          prices: [{ size: 'mediana', price: 140 }], // catalog price increased from 100 to 140
          extras: [],
        }),
      };
      const appConfigService = {
        getByIdOrDefault: jest
          .fn()
          .mockImplementation((key: string) =>
            key === 'packaging_sizes'
              ? Promise.resolve({ data: { sizes: [] } })
              : Promise.resolve({
                  data: { isExonerated: false, taxes: [{ percentage: 15 }] },
                }),
          ),
      };
      const pricing = new OrderPricingService(
        productsService as never,
        appConfigService as never,
        {} as never,
        {} as never,
        {} as never,
      );

      const snapshotResult = await pricing.calculateWithPrices(
        [
          {
            id: 55,
            productId: 'prod-1',
            name: 'Pizza Margarita',
            price: 100,
            size: 'mediana',
            quantity: 1,
            giftQuantity: 0,
            extras: [],
          },
        ],
        { source: 'none' },
        undefined,
        { useSnapshotPrices: true },
      );

      expect(snapshotResult.items[0].price).toBe(100);
      expect(snapshotResult.totals.total).toBe(115);
    });
  });
});
