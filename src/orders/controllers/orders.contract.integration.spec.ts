import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { RolesGuard, UserRoleDto } from '../../common';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { KitchensService } from '../../kitchens/kitchens.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ProductsService } from '../../products/services/products.service';
import { DISCOUNT_PROMOTIONS_REPOSITORY } from '../../promotions/interfaces/discount-promotions.repository';
import { HAPPY_HOUR_PROMOTIONS_REPOSITORY } from '../../promotions/interfaces/happy-hour-promotions.repository';
import { CouponPromotionsService } from '../../promotions/services/coupon-promotions.service';
import { AppConfigService } from '../../app-config/services/app-config.service';
import { OrderStatusDto } from '../dto/order-status.dto';
import { OrderTypeDto } from '../dto/order-type.dto';
import type { OrderEntity } from '../entities/order.entity';
import { ORDERS_REPOSITORY } from '../interfaces/orders.repository';
import { HiddenKitchenTicketsService } from '../services/hidden-kitchen-tickets.service';
import { OrderCancellationAuthorizationService } from '../services/order-cancellation-authorization.service';
import { OrderFinalizationService } from '../services/order-finalization.service';
import { OrderPricingService } from '../services/order-pricing.service';
import { OrderReferenceResolverService } from '../services/order-reference-resolver.service';
import { OrderTableAssignmentsService } from '../services/order-table-assignments.service';
import { OrdersService } from '../services/orders.service';
import { OrdersController } from './orders.controller';

class HeaderTestAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const roleHeader = (req.headers['x-test-role'] as string) || 'admin';
    const userId = (req.headers['x-test-user-id'] as string) || 'user-1';
    const permsHeader = req.headers['x-test-permissions'] as string | undefined;
    const permissions = permsHeader
      ? permsHeader
          .split(',')
          .map((p) => p.trim())
          .filter(Boolean)
      : [
          'orders.read',
          'orders.manage',
          'orders.status',
          'orders.finalize',
          'delivery.read',
        ];

    req.user = {
      id: userId,
      username: `user-${roleHeader}`,
      role: roleHeader as UserRoleDto,
      permissions,
    } satisfies AuthenticatedUser;
    return true;
  }
}

describe('Orders HTTP Contract & Guard Integration (H26)', () => {
  let app: INestApplication;
  const ordersStore = new Map<string, OrderEntity>();

  const repoMock = {
    listTodayOrActive: jest.fn(async () => Array.from(ordersStore.values())),
    listHistory: jest.fn(),
    listByDriverAndDate: jest.fn(async () => []),
    findById: jest.fn(async (id: string) => ordersStore.get(id) ?? null),
    create: jest.fn(async (data: any) => {
      const created: OrderEntity = {
        id: data.id ?? 'ord-created-1',
        items: data.items,
        subTotal: data.subTotal ?? data.total,
        discountAmount: data.discountAmount ?? 0,
        taxAmount: data.taxAmount ?? 0,
        total: data.total,
        status: data.status,
        timestamp: data.timestamp ?? new Date('2026-11-04T12:00:00.000Z'),
        updatedAt: new Date('2026-11-04T12:00:00.000Z'),
        orderType: data.orderType ?? OrderTypeDto.local,
        driverId: data.driverId,
        waiterId: data.waiterId,
        waiterSnapshotName: data.waiterSnapshotName,
        payments: data.payments ?? [],
        linkedTables: data.linkedTables ?? [],
      };
      ordersStore.set(created.id, created);
      return created;
    }),
    update: jest.fn(async (id: string, patch: any) => {
      const current = ordersStore.get(id);
      if (!current) throw new Error('Order not found');
      const updated: OrderEntity = {
        ...current,
        ...patch,
        items: patch.items ?? current.items,
        updatedAt: new Date('2026-11-04T12:05:00.000Z'),
      };
      ordersStore.set(id, updated);
      return updated;
    }),
    delete: jest.fn(),
    updateItemsKitchenStatus: jest.fn(),
    updateOperationalStatus: jest.fn(async () => new Date()),
  };

  const finalizationMock = {
    finalize: jest.fn(async (existing: OrderEntity, dto: any) => {
      ordersStore.set(existing.id, {
        ...existing,
        status: OrderStatusDto.paid,
        total: dto.finalTotal ?? existing.total,
        subTotal: dto.subTotal ?? existing.subTotal,
        taxAmount: dto.taxAmount ?? existing.taxAmount,
        discountAmount: dto.discountAmount ?? existing.discountAmount,
        payments: dto.payments ?? [],
        invoice: {
          invoiceNumber: 'NOV26-00001',
          correlativoId: 'corr-1',
          issuedAt: new Date('2026-11-04T12:10:00.000Z'),
        },
      });
    }),
    issueInTransaction: jest.fn(),
  };
  const prismaMock = {
    $transaction: jest.fn(async (cb: (tx: any) => any) =>
      cb({
        $queryRaw: jest.fn().mockResolvedValue([{ id: 'ord-paid-1' }]),
        order: {
          count: jest.fn().mockResolvedValue(0),
          findMany: jest.fn().mockResolvedValue([]),
        },
        certificado: { findMany: jest.fn().mockResolvedValue([]) },
        cupon: { findUnique: jest.fn().mockResolvedValue(null) },
      }),
    ),
    appConfig: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    order: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
    certificado: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    user: {
      findFirst: jest.fn(),
    },
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [
        OrdersService,
        OrderPricingService,
        { provide: ORDERS_REPOSITORY, useValue: repoMock },
        { provide: OrderFinalizationService, useValue: finalizationMock },
        {
          provide: ProductsService,
          useValue: {
            getProductById: jest.fn().mockResolvedValue({
              id: 'prod-pizza-1',
              name: 'Pizza Margarita',
              categoryId: 'cat-pizzas',
              isCombo: false,
              hasMultipleSizes: true,
              prices: [{ size: 'Grande', price: 250 }],
              extras: [],
            }),
          },
        },
        {
          provide: AppConfigService,
          useValue: {
            getByIdOrDefault: jest
              .fn()
              .mockImplementation(async (id: string) => {
                if (id === 'tax_config') {
                  return {
                    id,
                    data: { isExonerated: false, taxes: [{ percentage: 15 }] },
                  };
                }
                return { id, data: {} };
              }),
          },
        },
        {
          provide: DISCOUNT_PROMOTIONS_REPOSITORY,
          useValue: { findById: jest.fn().mockResolvedValue(null) },
        },
        {
          provide: HAPPY_HOUR_PROMOTIONS_REPOSITORY,
          useValue: { findById: jest.fn().mockResolvedValue(null) },
        },
        {
          provide: CouponPromotionsService,
          useValue: {
            findById: jest.fn().mockResolvedValue(null),
            findByCode: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: HiddenKitchenTicketsService,
          useValue: {
            listTicketIds: jest.fn().mockResolvedValue([]),
            hide: jest.fn(),
          },
        },
        {
          provide: OrderReferenceResolverService,
          useValue: {
            resolve: jest.fn().mockResolvedValue({
              customerId: undefined,
              cashierId: 'user-1',
              shiftId: 'shift-1',
            }),
          },
        },
        {
          provide: OrderTableAssignmentsService,
          useValue: {
            syncTablesForOrder: jest.fn().mockResolvedValue(undefined),
            releaseTablesForFinalStatus: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: OrderCancellationAuthorizationService,
          useValue: { authorize: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: KitchensService,
          useValue: {
            getAssignedKitchenIdForDate: jest
              .fn()
              .mockResolvedValue('kitchen-1'),
          },
        },
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
        {
          provide: EventEmitter2,
          useValue: { emit: jest.fn() },
        },
        { provide: APP_GUARD, useClass: HeaderTestAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    ordersStore.clear();
    jest.clearAllMocks();
  });

  it.each([{}, { tableIds: 'mesa' }, { tableIds: [42] }, { tableIds: [''] }])(
    'rechaza un contrato de mesas inválido: %j',
    async (body) => {
      const response = await request(app.getHttpServer())
        .patch('/orders/test-order/tables')
        .set('x-test-role', 'cajero')
        .set('x-test-permissions', 'orders.read,tables.operate')
        .send(body);
      expect(response.status).toBe(400);
    },
  );

  it('rechaza en HTTP (400) regalar productos con nota Vale: vacía sin certificado válido (H01)', async () => {
    const response = await request(app.getHttpServer())
      .post('/orders')
      .set('x-test-role', 'cajero')
      .set('x-test-permissions', 'orders.read,orders.manage')
      .send({
        items: [
          {
            productId: 'prod-pizza-1',
            name: 'Pizza Margarita',
            size: 'Grande',
            price: 250,
            quantity: 1,
            extras: [],
            giftQuantity: 1,
            note: 'Vale:   ',
          },
        ],
        total: 0,
        status: 'pending',
        orderType: 'local',
      });

    expect(response.status).toBe(400);
    expect(String(response.body.message)).toMatch(/certificado|vale/i);
  });

  it('bloquea con 403 el cobro por cambio de estado cuando el usuario carece de orders.finalize (H07)', async () => {
    ordersStore.set('ord-pending-1', {
      id: 'ord-pending-1',
      items: [
        {
          id: 1,
          productId: 'prod-pizza-1',
          name: 'Pizza Margarita',
          size: 'Grande',
          price: 250,
          quantity: 1,
          isSentToKitchen: true,
          kitchenStatus: 'ready' as any,
        },
      ],
      subTotal: 250,
      discountAmount: 0,
      taxAmount: 37.5,
      total: 287.5,
      status: OrderStatusDto.ready,
      timestamp: new Date('2026-11-04T12:00:00.000Z'),
      updatedAt: new Date('2026-11-04T12:00:00.000Z'),
      orderType: OrderTypeDto.local,
    });

    const response = await request(app.getHttpServer())
      .patch('/orders/ord-pending-1/status')
      .set('x-test-role', 'mesero')
      .set('x-test-permissions', 'orders.read,orders.status')
      .send({ status: 'paid' });

    expect(response.status).toBe(403);
  });

  it('asigna al mesero autenticado al abrir una orden de mesa', async () => {
    const waiterId = '11111111-1111-4111-8111-111111111111';
    prismaMock.user.findFirst.mockResolvedValue({
      id: waiterId,
      username: 'ana',
      firstName: 'Ana',
      lastName: 'López',
    });

    const response = await request(app.getHttpServer())
      .post('/orders')
      .set('x-test-role', 'mesero')
      .set('x-test-user-id', waiterId)
      .set('x-test-permissions', 'orders.read,orders.manage')
      .send({
        items: [],
        total: 0,
        status: 'pending',
        orderType: 'local',
        linkedTables: ['table-1'],
      })
      .expect(201);

    expect(response.body.waiterId).toBe(waiterId);
    expect(response.body.waiterSnapshotName).toBe('Ana López');
    expect(repoMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        waiterId,
        waiterSnapshotName: 'Ana López',
      }),
      expect.anything(),
    );
  });

  it('permite reasignar una orden abierta a un mesero activo', async () => {
    const waiterId = '22222222-2222-4222-8222-222222222222';
    ordersStore.set('ord-waiter-1', {
      id: 'ord-waiter-1',
      items: [],
      total: 0,
      status: OrderStatusDto.pending,
      timestamp: new Date('2026-11-04T12:00:00.000Z'),
      orderType: OrderTypeDto.local,
    });
    prismaMock.user.findFirst.mockResolvedValue({
      id: waiterId,
      username: 'bea',
      firstName: 'Bea',
      lastName: 'Pérez',
    });

    const response = await request(app.getHttpServer())
      .patch('/orders/ord-waiter-1/waiter')
      .set('x-test-role', 'cajero')
      .set('x-test-permissions', 'orders.read,tables.operate')
      .send({ waiterId })
      .expect(200);

    expect(response.body.waiterId).toBe(waiterId);
    expect(response.body.waiterSnapshotName).toBe('Bea Pérez');
  });

  it('bloquea con 403 a un motorizado que intenta consultar una orden ajena por ID (H08)', async () => {
    ordersStore.set('ord-delivery-other', {
      id: 'ord-delivery-other',
      items: [],
      total: 287.5,
      status: OrderStatusDto.ready,
      timestamp: new Date('2026-11-04T12:00:00.000Z'),
      orderType: OrderTypeDto.delivery,
      driverId: 'driver-other',
    });

    const response = await request(app.getHttpServer())
      .get('/orders/ord-delivery-other')
      .set('x-test-role', 'motorizado')
      .set('x-test-user-id', 'driver-me')
      .set('x-test-permissions', 'orders.read,delivery.read');

    expect(response.status).toBe(403);
  });

  it('impide con 400 modificar cantidades o eliminar líneas comerciales de una orden ya pagada (H02)', async () => {
    ordersStore.set('ord-paid-1', {
      id: 'ord-paid-1',
      items: [
        {
          id: 10,
          productId: 'prod-pizza-1',
          name: 'Pizza Margarita',
          size: 'Grande',
          price: 250,
          quantity: 2,
          extras: [],
          isSentToKitchen: true,
        },
      ],
      subTotal: 500,
      discountAmount: 0,
      taxAmount: 75,
      total: 575,
      status: OrderStatusDto.paid,
      timestamp: new Date('2026-11-04T12:00:00.000Z'),
      orderType: OrderTypeDto.local,
    });

    const response = await request(app.getHttpServer())
      .patch('/orders/ord-paid-1/items')
      .set('x-test-role', 'admin')
      .set('x-test-permissions', 'orders.read,orders.manage')
      .send({
        items: [
          {
            id: 10,
            productId: 'prod-pizza-1',
            name: 'Pizza Margarita',
            size: 'Grande',
            price: 250,
            quantity: 1,
            extras: [],
          },
        ],
        total: 575,
      });

    expect(response.status).toBe(400);
    expect(String(response.body.message)).toMatch(/facturada|pagada/i);
  });

  it('ejecuta el flujo completo de creación y cobro de orden validando pagos e importes (H04, H15, H28)', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/orders')
      .set('x-test-role', 'cajero')
      .set('x-test-permissions', 'orders.read,orders.manage,orders.finalize')
      .send({
        items: [
          {
            productId: 'prod-pizza-1',
            name: 'Pizza Margarita',
            size: 'Grande',
            price: 250,
            quantity: 1,
            extras: [],
          },
        ],
        total: 287.5,
        status: 'pending',
        orderType: 'local',
      });

    expect(createRes.status).toBe(201);
    const createdOrderId = createRes.body.id;

    // Rechaza pago adulterado con originalAmount inconsistente en NIO (H15)
    const badFinalizeRes = await request(app.getHttpServer())
      .patch(`/orders/${createdOrderId}/finalize`)
      .set('x-test-role', 'cajero')
      .set('x-test-permissions', 'orders.read,orders.finalize')
      .send({
        payments: [
          {
            method: 'EFECTIVO',
            methodConfigId: 'cash-nio',
            amount: 287.5,
            currency: 'NIO',
            originalAmount: 100,
            exchangeRate: 1,
          },
        ],
      });
    expect(badFinalizeRes.status).toBe(400);

    // Cobro legítimo emite factura y marca orden como pagada
    const okFinalizeRes = await request(app.getHttpServer())
      .patch(`/orders/${createdOrderId}/finalize`)
      .set('x-test-role', 'cajero')
      .set('x-test-permissions', 'orders.read,orders.finalize')
      .send({
        payments: [
          {
            method: 'EFECTIVO',
            methodConfigId: 'cash-nio',
            amount: 287.5,
            currency: 'NIO',
            originalAmount: 287.5,
            exchangeRate: 1,
          },
        ],
      });

    expect(okFinalizeRes.status).toBe(200);
    expect(okFinalizeRes.body).toMatchObject({
      id: createdOrderId,
      status: 'paid',
      total: 287.5,
      invoice: {
        invoiceNumber: 'NOV26-00001',
      },
    });
  });
});
