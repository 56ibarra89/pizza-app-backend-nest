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
  const hiddenOrdersStore = new Set<string>();
  const writeDeliveryAudit = jest.fn();

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
        customerPhone: data.customerPhoneSnapshot,
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
          correlativoId: 'corr-1',
          documentType: 'FACTURA',
          resolutionNumber: 'RES-1',
          prefix: 'NOV26-',
          issuedNumber: 1,
          invoiceNumber: 'NOV26-00001',
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
        systemLog: { create: writeDeliveryAudit },
        cupon: { findUnique: jest.fn().mockResolvedValue(null) },
      }),
    ),
    appConfig: {
      findUnique: jest.fn().mockImplementation(({ where }: { where: { id: string } }) => Promise.resolve(where.id === 'delivery_rules' ? { data: {
        freeDeliveryEnabled: true,
        freeDeliveryMinAmount: 200,
        zones: [{ id: 'zona-1', name: 'Centro', price: 35, driverPayout: 25, isActive: true }],
      } } : where.id === 'payment_methods' ? { data: { methods: [{ id: 'cash-nio', name: 'Efectivo', type: 'CASH', currency: 'NIO', requiresReference: false, commissionRate: 0, isActive: true }, { id: 'card-generic', name: 'Tarjeta', type: 'CARD_POS', currency: 'NIO', requiresReference: true, commissionRate: 0, isActive: true }] } } : where.id === 'void_waste_policies' ? { data: { reasons: [{ id: 'error-comanda-mesero', label: 'Error de comanda', category: 'SERVICE', isActive: true, countsAsWaste: false, requiresSupervisor: false }] } } : null)),
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
                if (id === 'app_factura_tax_config') {
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
            listHiddenOrderIds: jest.fn(async () =>
              Array.from(hiddenOrdersStore),
            ),
            hideOrderIds: jest.fn(async (ids: readonly string[]) => {
              ids.forEach((id) => hiddenOrdersStore.add(id));
            }),
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

  it('limita la respuesta del cocinero a su cocina y omite datos financieros y personales', async () => {
    ordersStore.set('order-kitchens', {
      id: 'order-kitchens',
      status: OrderStatusDto.pending,
      total: 400,
      timestamp: new Date('2026-11-04T12:00:00.000Z'),
      orderType: OrderTypeDto.local,
      customerSnapshotName: 'Cliente',
      customerPhone: '88888888',
      customerAddress: 'Dirección privada',
      payments: [{ method: 'EFECTIVO', amount: 400 } as never],
      items: [
        {
          id: 1,
          name: 'Pizza',
          size: 'único',
          price: 200,
          quantity: 1,
          giftQuantity: 0,
          extras: [],
          kitchenId: 'kitchen-2',
        },
        {
          id: 2,
          name: 'Combo',
          size: 'único',
          price: 200,
          quantity: 1,
          giftQuantity: 0,
          extras: [],
          isCombo: true,
          comboSelections: [
            {
              groupId: 'g',
              groupName: 'Plato',
              productId: 'p1',
              productName: 'Componente propio',
              quantity: 1,
              extraPrice: 50,
              kitchenId: 'kitchen-1',
            },
            {
              groupId: 'g',
              groupName: 'Plato',
              productId: 'p2',
              productName: 'Componente ajeno',
              quantity: 1,
              extraPrice: 60,
              kitchenId: 'kitchen-2',
            },
          ],
        },
      ],
    });

    const response = await request(app.getHttpServer())
      .get('/orders')
      .set('x-test-role', 'cocinero')
      .set('x-test-permissions', 'orders.read');

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    const visible = response.body[0];
    expect(visible.items).toHaveLength(1);
    expect(visible.items[0].comboSelections).toHaveLength(1);
    expect(visible.items[0].comboSelections[0].productName).toBe(
      'Componente propio',
    );
    expect(visible).not.toHaveProperty('total');
    expect(visible).not.toHaveProperty('payments');
    expect(visible).not.toHaveProperty('customerPhone');
    expect(visible).not.toHaveProperty('customerAddress');

    repoMock.listHistory.mockResolvedValueOnce({
      items: Array.from(ordersStore.values()),
      total: 1,
      paymentMethodOptions: [{ id: 'card-1', name: 'Tarjeta' }],
    });
    const history = await request(app.getHttpServer())
      .get(
        '/orders/history?startDate=2026-11-04&endDate=2026-11-04&paymentMethodId=card-1',
      )
      .set('x-test-role', 'cocinero')
      .set('x-test-permissions', 'orders.read');

    expect(history.status).toBe(200);
    expect(history.body.paymentMethodOptions).toEqual([]);
    expect(history.body.items[0]).not.toHaveProperty('payments');
    expect(repoMock.listHistory).toHaveBeenCalledWith(
      expect.objectContaining({ paymentMethodId: undefined }),
    );
  });

  it('rechaza una versión de orden inválida en el contrato HTTP', async () => {
    const response = await request(app.getHttpServer())
      .patch('/orders/order-1/items')
      .set('x-test-role', 'admin')
      .set('x-test-permissions', 'orders.read,orders.manage')
      .send({ expectedUpdatedAt: 'ayer', items: [], total: 0 });

    expect(response.status).toBe(400);
    expect(repoMock.update).not.toHaveBeenCalled();
  });

  it('rechaza fechas de versión inválidas antes del cobro', async () => {
    const response = await request(app.getHttpServer())
      .patch('/orders/order-1/finalize')
      .set('x-test-role', 'admin')
      .set('x-test-permissions', 'orders.read,orders.finalize')
      .send({ expectedUpdatedAt: 'ayer', payments: [] });
    expect(response.status).toBe(400);
    expect(finalizationMock.finalize).not.toHaveBeenCalled();
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

  function submitDelivery(role: string, charge?: number, overrideReason?: string) {
    return request(app.getHttpServer())
      .post('/orders')
      .set('x-test-role', role)
      .set('x-test-permissions', 'orders.read,orders.manage')
      .send({
        orderType: 'delivery',
        customerAddress: 'Dirección de prueba',
        customerPhone: '88880002',
        deliveryZoneId: 'zona-1',
        deliveryFeeOverrideReason: overrideReason,
        total: 250 + (charge ?? 0),
        items: [
          { productId: 'prod-pizza-1', name: 'Pizza Margarita', size: 'Grande', price: 250, quantity: 1, extras: [] },
          ...(charge === undefined ? [] : [{ name: 'Delivery', size: 'único', price: charge, quantity: 1, extras: [] }]),
        ],
      });
  }

  it('registra una entrega gratuita elegible y conserva el teléfono indicado', async () => {
    const response = await submitDelivery('cajero', 0);
    expect(response.status).toBe(201);
    expect(response.body.customerPhone).toBe('88880002');
    expect(response.body.items[1].note).toContain('Pago Motorizado: C$25.00');
    expect(writeDeliveryAudit).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'Envío gratis por promoción',
        entityId: response.body.id,
        metadata: expect.objectContaining({ amount: 0, source: 'promotion' }),
      }),
    });
  });

  it('rechaza un pedido sin tarifa y una tarifa que difiere del precio aplicable', async () => {
    expect((await submitDelivery('cajero')).status).toBe(400);
    expect((await submitDelivery('cajero', 35)).status).toBe(400);
    expect(repoMock.create).not.toHaveBeenCalled();
  });

  it('cobra la tarifa configurada cuando el consumo está debajo del mínimo promocional', async () => {
    const rules = {
      data: {
        freeDeliveryEnabled: true,
        freeDeliveryMinAmount: 300,
        zones: [{ id: 'zona-1', name: 'Centro', price: 35, driverPayout: 25, isActive: true }],
      },
    };
    prismaMock.appConfig.findUnique.mockResolvedValueOnce(rules);
    expect((await submitDelivery('cajero', 0)).status).toBe(400);
    prismaMock.appConfig.findUnique.mockResolvedValueOnce(rules);
    const response = await submitDelivery('cajero', 35);
    expect(response.status).toBe(201);
    expect(response.body.items[1].price).toBe(35);
    expect(writeDeliveryAudit).not.toHaveBeenCalled();
  });

  it('solo acepta una tarifa excepcional de un rol autorizado y registra el motivo', async () => {
    expect((await submitDelivery('cajero', 10, 'Excepción de servicio')).status).toBe(403);
    const response = await submitDelivery('cajero_principal', 10, 'Excepción de servicio');
    expect(response.status).toBe(201);
    expect(writeDeliveryAudit).toHaveBeenCalledTimes(1);
    expect(writeDeliveryAudit).toHaveBeenCalledWith({
      data: expect.objectContaining({
        details: 'Excepción de servicio',
        role: 'cajero_principal',
        metadata: expect.objectContaining({ amount: 10, source: 'manual' }),
      }),
    });
  });

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
          extras: [],
          giftQuantity: 0,
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
      payments: [],
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
    const updatedAt = new Date('2026-11-04T12:00:00.000Z');
    ordersStore.set('ord-waiter-1', {
      id: 'ord-waiter-1',
      items: [],
      payments: [],
      linkedTables: ['table-1'],
      total: 0,
      status: OrderStatusDto.pending,
      timestamp: new Date('2026-11-04T12:00:00.000Z'),
      updatedAt,
      orderType: OrderTypeDto.local,
    });
    prismaMock.$transaction.mockImplementationOnce(
      async (cb: (tx: any) => any) =>
        cb({
          $queryRaw: jest.fn().mockResolvedValue([
            {
              id: 'ord-waiter-1',
              status: 'PENDING',
              updatedAt,
            },
          ]),
        }),
    );
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

  it('rechaza con 400 reasignar mesero a orden sin mesas o de delivery (B34)', async () => {
    const waiterId = '22222222-2222-4222-8222-222222222222';
    ordersStore.set('ord-no-tables', {
      id: 'ord-no-tables',
      items: [],
      payments: [],
      linkedTables: [],
      total: 0,
      status: OrderStatusDto.pending,
      timestamp: new Date('2026-11-04T12:00:00.000Z'),
      orderType: OrderTypeDto.local,
    });

    await request(app.getHttpServer())
      .patch('/orders/ord-no-tables/waiter')
      .set('x-test-role', 'cajero')
      .set('x-test-permissions', 'orders.read,tables.operate')
      .send({ waiterId })
      .expect(400);
  });

  it('bloquea con 403 a un motorizado que intenta consultar una orden ajena por ID (H08)', async () => {
    ordersStore.set('ord-delivery-other', {
      id: 'ord-delivery-other',
      items: [],
      payments: [],
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
          giftQuantity: 0,
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
      updatedAt: new Date('2026-11-04T12:00:00.000Z'),
      payments: [],
      orderType: OrderTypeDto.local,
    });

    const response = await request(app.getHttpServer())
      .patch('/orders/ord-paid-1/items')
      .set('x-test-role', 'admin')
      .set('x-test-permissions', 'orders.read,orders.manage')
      .send({
        expectedUpdatedAt: '2026-11-04T12:00:00.000Z',
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

  it('rechaza calcular órdenes cuando no hay impuestos configurados', async () => {
    const config = app.get(AppConfigService);
    const original = (config.getByIdOrDefault as jest.Mock).getMockImplementation();
    const spy = jest.spyOn(config, 'getByIdOrDefault').mockResolvedValue({ id: 'app_factura_tax_config', data: {}, updatedAt: new Date(0) });
    try {
      const response = await request(app.getHttpServer())
        .post('/orders')
        .set('x-test-role', 'cajero')
        .set('x-test-permissions', 'orders.read,orders.manage')
        .send({ items: [], total: 0, status: 'pending', orderType: 'local' });
      expect(response.status).toBe(400);
      expect(String(response.body.message)).toContain('Configura los impuestos');
    } finally {
      spy.mockRestore();
      if (original) (config.getByIdOrDefault as jest.Mock).mockImplementation(original);
    }
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

  it('rechaza con 400 propiedades forjadas de turno, fecha o cajero al crear órdenes o registrar pagos (B38)', async () => {
    const baseItem = {
      productId: 'prod-pizza-1',
      name: 'Pizza Margarita',
      size: 'Grande',
      price: 250,
      quantity: 1,
      extras: [],
    };

    for (const forgedBody of [
      { items: [baseItem], total: 287.5, shiftId: 'old-shift' },
      { items: [baseItem], total: 287.5, cashierId: 'admin-1' },
      { items: [baseItem], total: 287.5, cashierSnapshotName: 'admin' },
      {
        items: [baseItem],
        total: 287.5,
        timestamp: '2020-01-01T00:00:00.000Z',
      },
      {
        items: [baseItem],
        total: 287.5,
        payments: [{ method: 'EFECTIVO', amount: 287.5, cashierId: 'admin-1' }],
      },
    ]) {
      const response = await request(app.getHttpServer())
        .post('/orders')
        .set('x-test-role', 'cajero')
        .set('x-test-permissions', 'orders.read,orders.manage,orders.finalize')
        .send(forgedBody);
      expect(response.status).toBe(400);
    }
  });

  it('lista solo entregas para despacho y mantiene al motorizado en su bandeja propia', async () => {
    const dispatcher = await request(app.getHttpServer())
      .get('/orders/deliveries')
      .set('x-test-role', 'despachador')
      .set('x-test-permissions', 'delivery.read')
      .expect(200);
    expect(dispatcher.body).toEqual([]);
    expect(repoMock.listTodayOrActive).toHaveBeenCalledWith(
      expect.any(Date),
      { deliveryOnly: true },
    );

    await request(app.getHttpServer())
      .get('/orders/deliveries')
      .set('x-test-role', 'motorizado')
      .set('x-test-permissions', 'delivery.read,delivery.own')
      .expect(403);
  });

  it.each([
    { requiresPreparation: true, expectedStatus: 400, name: 'Pizza sin enviar' },
    { requiresPreparation: false, expectedStatus: 200, name: 'Gaseosa' },
  ])('valida inicio y finalización de entrega para $name', async ({
    requiresPreparation,
    expectedStatus,
    name,
  }) => {
    const orderId = 'ord-delivery-preparation';
    ordersStore.set(orderId, {
      id: orderId,
      items: [{
        id: 1,
        name,
        size: 'Unidad',
        price: 220,
        quantity: 1,
        extras: [],
        giftQuantity: 0,
        requiresPreparation,
        isSentToKitchen: false,
      }],
      total: 220,
      status: OrderStatusDto.ready,
      timestamp: new Date('2026-11-04T12:00:00.000Z'),
      orderType: OrderTypeDto.delivery,
      driverId: 'driver-42',
      payments: [],
    });

    const started = await request(app.getHttpServer())
      .patch(`/orders/${orderId}/start-delivery`)
      .set('x-test-role', 'motorizado')
      .set('x-test-user-id', 'driver-42')
      .set('x-test-permissions', 'delivery.read')
      .expect(expectedStatus);
    const delivered = await request(app.getHttpServer())
      .patch(`/orders/${orderId}/status`)
      .set('x-test-role', 'motorizado')
      .set('x-test-user-id', 'driver-42')
      .set('x-test-permissions', 'delivery.read,orders.status')
      .send({ status: 'delivered' })
      .expect(expectedStatus);

    if (requiresPreparation) {
      expect(started.body.message).toMatch(/no está listo en cocina/);
      expect(delivered.body.message).toMatch(/no está listo en cocina/);
      expect(repoMock.update).not.toHaveBeenCalled();
    } else {
      expect(started.body.deliveryStartedAt).toEqual(expect.any(String));
      expect(delivered.body.deliveredAt).toEqual(expect.any(String));
    }
  });

  it('permite a motorizado leer /orders/my-deliveries sin orders.read y bloquea /orders general (B39)', async () => {
    ordersStore.set('ord-driver-1', {
      id: 'ord-driver-1',
      items: [],
      total: 320,
      status: OrderStatusDto.ready,
      timestamp: new Date('2026-11-01T10:00:00.000Z'),
      orderType: OrderTypeDto.delivery,
      driverId: 'driver-42',
      payments: [],
    });
    ordersStore.set('ord-other-driver', {
      id: 'ord-other-driver',
      items: [],
      total: 150,
      status: OrderStatusDto.ready,
      timestamp: new Date('2026-11-01T10:00:00.000Z'),
      orderType: OrderTypeDto.delivery,
      driverId: 'driver-other',
      payments: [],
    });

    repoMock.listTodayOrActive.mockResolvedValueOnce([
      ordersStore.get('ord-driver-1')!,
    ]);

    const deniedList = await request(app.getHttpServer())
      .get('/orders')
      .set('x-test-role', 'motorizado')
      .set('x-test-user-id', 'driver-42')
      .set('x-test-permissions', 'delivery.read,delivery.own,orders.status');
    expect(deniedList.status).toBe(403);

    const myDeliveries = await request(app.getHttpServer())
      .get('/orders/my-deliveries')
      .set('x-test-role', 'motorizado')
      .set('x-test-user-id', 'driver-42')
      .set('x-test-permissions', 'delivery.read,delivery.own,orders.status');
    expect(myDeliveries.status).toBe(200);
    expect(myDeliveries.body).toHaveLength(1);
    expect(myDeliveries.body[0].id).toBe('ord-driver-1');

    const forbiddenById = await request(app.getHttpServer())
      .get('/orders/my-deliveries/ord-other-driver')
      .set('x-test-role', 'motorizado')
      .set('x-test-user-id', 'driver-42')
      .set('x-test-permissions', 'delivery.read,delivery.own');
    expect(forbiddenById.status).toBe(403);
  });

  it('separa /orders/hidden-orders del KDS para cajeros sin permisos de cocina y devuelve 400 en fechas inválidas (F49, B41)', async () => {
    const kdsDenied = await request(app.getHttpServer())
      .get('/orders/kitchen/hidden-tickets')
      .set('x-test-role', 'cajero')
      .set('x-test-permissions', 'orders.read,orders.manage');
    expect(kdsDenied.status).toBe(403);

    const hideRes = await request(app.getHttpServer())
      .post('/orders/hidden-orders')
      .set('x-test-role', 'cajero')
      .set('x-test-permissions', 'orders.read,orders.manage')
      .send({ orderIds: ['ord-hist-1'] });
    expect(hideRes.status).toBe(201);

    const hiddenRes = await request(app.getHttpServer())
      .get('/orders/hidden-orders')
      .set('x-test-role', 'cajero')
      .set('x-test-permissions', 'orders.read');
    expect(hiddenRes.status).toBe(200);
    expect(hiddenRes.body).toContain('ord-hist-1');

    const badMetricsRes = await request(app.getHttpServer())
      .get('/orders/cancellations/metrics?startDate=2026-11-31')
      .set('x-test-role', 'admin')
      .set('x-test-permissions', 'orders.read,reports.read');
    expect(badMetricsRes.status).toBe(400);
  });

  it('valida expectedUpdatedAt en PATCH /orders/:id/status (400 formato inválido, 409 versión obsoleta) (B54)', async () => {
    ordersStore.set('ord-b54-contract', {
      id: 'ord-b54-contract',
      status: OrderStatusDto.pending,
      total: 287.5,
      subTotal: 250,
      discountAmount: 0,
      taxAmount: 37.5,
      timestamp: new Date('2026-11-04T12:00:00.000Z'),
      updatedAt: new Date('2026-11-04T12:05:00.000Z'),
      orderType: OrderTypeDto.local,
      payments: [],
      items: [
        {
          id: 1,
          productId: 'prod-pizza-1',
          name: 'Pizza Margarita',
          size: 'Grande',
          price: 250,
          quantity: 1,
          giftQuantity: 0,
          extras: [],
        },
      ],
    });

    const badDateRes = await request(app.getHttpServer())
      .patch('/orders/ord-b54-contract/status')
      .set('x-test-role', 'admin')
      .set(
        'x-test-permissions',
        'orders.status,orders.read,orders.cancel,orders.finalize',
      )
      .send({
        status: 'cancelled',
        expectedUpdatedAt: 'no-es-iso',
      });
    expect(badDateRes.status).toBe(400);

    const staleRes = await request(app.getHttpServer())
      .patch('/orders/ord-b54-contract/status')
      .set('x-test-role', 'admin')
      .set(
        'x-test-permissions',
        'orders.status,orders.read,orders.cancel,orders.finalize',
      )
      .send({
        status: 'cancelled',
        cancelReasonId: 'error-comanda-mesero',
        expectedUpdatedAt: '2026-11-04T12:04:00.000Z',
      });
    expect(staleRes.status).toBe(409);
  });
});
