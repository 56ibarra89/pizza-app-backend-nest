import type { JwtService } from '@nestjs/jwt';
import type { AccessControlService } from '../../access-control/access-control.service';
import { UserRoleDto } from '../../common';
import type { KitchensService } from '../../kitchens/kitchens.service';
import type { UserEntity } from '../../users/entities/user.entity';
import type { IUsersRepository } from '../../users/interfaces/users.repository';
import { OrdersGateway } from './orders.gateway';

type GatewayMiddleware = (
  socket: unknown,
  next: (error?: Error) => void,
) => void;

describe('OrdersGateway authorization', () => {
  const verifyAsync = jest.fn();
  const findById = jest.fn();
  const authorizationForUser = jest.fn();
  const getAssignedKitchenIdForDate = jest.fn();

  const jwtService = { verifyAsync } as unknown as JwtService;
  const usersRepository = { findById } as unknown as IUsersRepository;
  const accessControl = {
    authorizationForUser,
  } as unknown as AccessControlService;
  const kitchens = {
    getAssignedKitchenIdForDate,
  } as unknown as KitchensService;

  const activeUser = {
    id: 'user-1',
    username: 'cajero-1',
    firstName: 'Caja',
    lastName: 'Uno',
    role: UserRoleDto.cajero,
    isActive: true,
    failedLoginAttempts: 0,
    lockoutLevel: 0,
    themePreference: 'system',
    tokenVersion: 4,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  } satisfies UserEntity;

  const connect = async () => {
    const middlewareRef: { current?: GatewayMiddleware } = {};
    const emit = jest.fn();
    const server = {
      use: (middleware: GatewayMiddleware) => {
        middlewareRef.current = middleware;
      },
      to: jest.fn().mockReturnValue({ emit }),
    };
    const gateway = new OrdersGateway(
      jwtService,
      kitchens,
      accessControl,
      usersRepository,
    );
    gateway.afterInit(server as never);

    const middleware = middlewareRef.current;
    if (!middleware) {
      throw new Error('El gateway no registró el middleware de seguridad.');
    }
    const socket = {
      data: {},
      handshake: {
        auth: { token: 'access-token' },
        headers: {},
      },
      join: jest.fn().mockResolvedValue(undefined),
      leave: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn(),
      on: jest.fn(),
    };
    const next = jest.fn();

    middleware(socket, next);
    await new Promise<void>((resolve) => setImmediate(resolve));

    return { gateway, next, socket, emit, to: server.to };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    verifyAsync.mockResolvedValue({
      sub: activeUser.id,
      tokenVersion: activeUser.tokenVersion,
      type: 'access',
    });
    findById.mockResolvedValue(activeUser);
  });

  it('rechaza el socket cuando el permiso orders.read fue retirado', async () => {
    authorizationForUser.mockResolvedValue({
      accessRoleId: 'role-1',
      accessRoleName: 'Sin órdenes',
      permissions: ['home.access'],
    });

    const { next, socket } = await connect();

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(socket.join).not.toHaveBeenCalled();
  });

  it('suscribe al canal completo únicamente cuando tiene orders.read', async () => {
    authorizationForUser.mockResolvedValue({
      accessRoleId: 'role-1',
      accessRoleName: 'Caja',
      permissions: ['home.access', 'orders.read'],
    });

    const { next, socket } = await connect();

    expect(socket.join).toHaveBeenCalledWith(
      'authenticated-full-orders-clients',
    );
    expect(next).toHaveBeenCalledWith();
  });

  it('envía únicamente entregas al canal de despacho con delivery.read', async () => {
    findById.mockResolvedValue({ ...activeUser, role: UserRoleDto.despachador });
    authorizationForUser.mockResolvedValue({ permissions: ['delivery.read'] });

    const { gateway, next, socket, to } = await connect();
    expect(next).toHaveBeenCalledWith();
    expect(socket.join).toHaveBeenCalledTimes(1);
    expect(socket.join).toHaveBeenCalledWith('authenticated-delivery-clients');

    const order = {
      id: 'order-1',
      status: 'pending' as never,
      timestamp: new Date('2026-11-04T12:00:00.000Z'),
      total: 100,
      items: [],
      payments: [],
    };
    await gateway.handleOrderSynchronized({
      mutation: 'updated',
      order: { ...order, orderType: 'local' as never },
    });
    expect(to).not.toHaveBeenCalledWith('authenticated-delivery-clients');

    await gateway.handleOrderSynchronized({
      mutation: 'updated',
      order: { ...order, orderType: 'delivery' as never },
    });
    expect(to).toHaveBeenCalledWith('authenticated-delivery-clients');
  });

  it('desconecta y retira del canal un socket cuando llega evento de revalidación de seguridad (H10)', async () => {
    authorizationForUser.mockResolvedValue({
      accessRoleId: 'role-1',
      accessRoleName: 'Caja',
      permissions: ['home.access', 'orders.read'],
    });

    const { gateway, socket } = await connect();

    findById.mockResolvedValueOnce({
      ...activeUser,
      tokenVersion: activeUser.tokenVersion + 1,
    });

    await gateway.handleSecurityRevalidation({ userId: activeUser.id });

    expect(socket.leave).toHaveBeenCalledWith(
      'authenticated-full-orders-clients',
    );
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('evita revalidar en BD dentro de la ventana TTL y revalida al expirar el TTL (B32)', async () => {
    authorizationForUser.mockResolvedValue({
      accessRoleId: 'role-1',
      accessRoleName: 'Caja',
      permissions: ['home.access', 'orders.read'],
    });

    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    try {
      const { gateway, socket } = await connect();
      expect(findById).toHaveBeenCalledTimes(1);

      await gateway.handleOrderSynchronized({
        mutation: 'updated',
        order: {
          id: 'order-ttl-1',
          status: 'pending' as never,
          total: 100,
          timestamp: new Date('2026-10-24T12:00:00.000Z'),
          items: [],
          payments: [],
        },
      });
      expect(findById).toHaveBeenCalledTimes(1);
      expect(socket.disconnect).not.toHaveBeenCalled();

      nowSpy.mockReturnValue(1_031_000);
      findById.mockResolvedValueOnce({
        ...activeUser,
        tokenVersion: activeUser.tokenVersion + 1,
      });

      await gateway.handleOrderSynchronized({
        mutation: 'updated',
        order: {
          id: 'order-ttl-2',
          status: 'pending' as never,
          total: 100,
          timestamp: new Date('2026-10-24T12:00:00.000Z'),
          items: [],
          payments: [],
        },
      });

      expect(findById).toHaveBeenCalledTimes(2);
      expect(socket.disconnect).toHaveBeenCalledWith(true);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('asigna al motorizado su sala privada de repartidor y emite solo sus entregas (B32)', async () => {
    const driverUser: UserEntity = {
      ...activeUser,
      id: 'driver-7',
      username: 'moto7',
      role: UserRoleDto.motorizado,
    };
    findById.mockResolvedValue(driverUser);
    authorizationForUser.mockResolvedValue({
      accessRoleId: 'role-driver',
      accessRoleName: 'Motorizado',
      permissions: ['orders.read', 'delivery.read'],
    });

    const { gateway, socket, emit } = await connect();

    expect(socket.join).toHaveBeenCalledWith('authenticated-driver:driver-7');
    expect(socket.join).not.toHaveBeenCalledWith(
      'authenticated-full-orders-clients',
    );

    await gateway.handleOrderSynchronized({
      mutation: 'updated',
      order: {
        id: 'ord-delivery-7',
        status: 'pending' as never,
        orderType: 'delivery' as never,
        driverId: 'driver-7',
        total: 250,
        timestamp: new Date('2026-11-04T12:00:00.000Z'),
        items: [],
        payments: [],
      },
    });

    expect(emit).toHaveBeenCalled();
  });

  it('rota el token del socket conectado mediante auth:refresh y respeta ConfigService en CORS (B32)', async () => {
    authorizationForUser.mockResolvedValue({
      accessRoleId: 'role-1',
      accessRoleName: 'Caja',
      permissions: ['home.access', 'orders.read'],
    });

    const { socket } = await connect();
    const refreshCall = socket.on.mock.calls.find(
      ([event]: [string]) => event === 'auth:refresh',
    ) as [string, (payload?: { token?: string }) => void] | undefined;
    expect(refreshCall).toBeDefined();

    refreshCall?.[1]({ token: 'rotated-access-token' });
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(verifyAsync).toHaveBeenLastCalledWith('rotated-access-token');
    expect((socket.data as { token?: string }).token).toBe(
      'rotated-access-token',
    );
    expect(socket.disconnect).not.toHaveBeenCalled();

    const customGateway = new OrdersGateway(
      jwtService,
      kitchens,
      accessControl,
      usersRepository,
      {
        get: (key: string) =>
          key === 'CORS_ORIGINS'
            ? 'https://pos.pizzatogo.local'
            : key === 'API_HOST'
              ? '0.0.0.0'
              : undefined,
      } as never,
    );
    expect(customGateway.isOriginAllowed('https://pos.pizzatogo.local')).toBe(
      true,
    );
    expect(customGateway.isOriginAllowed('https://evil.example.com')).toBe(
      false,
    );
  });

  it('emite a cada cocina únicamente sus componentes sin pagos ni datos privados', async () => {
    const kitchenEmit = jest.fn();
    const gateway = new OrdersGateway(
      jwtService,
      kitchens,
      accessControl,
      usersRepository,
    );
    gateway.afterInit({
      use: jest.fn(),
      to: jest.fn((room: string) => ({
        emit:
          room === 'authenticated-kitchen:kitchen-1' ? kitchenEmit : jest.fn(),
      })),
    } as never);

    await gateway.handleOrderSynchronized({
      mutation: 'updated',
      order: {
        id: 'order-1',
        status: 'pending' as never,
        total: 200,
        timestamp: new Date('2026-11-04T12:00:00.000Z'),
        customerPhone: '88888888',
        payments: [{ method: 'EFECTIVO', amount: 200 } as never],
        items: [
          {
            id: 1,
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
                groupName: 'Grupo',
                productId: 'p1',
                productName: 'Propio',
                quantity: 1,
                extraPrice: 0,
                kitchenId: 'kitchen-1',
              },
              {
                groupId: 'g',
                groupName: 'Grupo',
                productId: 'p2',
                productName: 'Ajeno',
                quantity: 1,
                extraPrice: 0,
                kitchenId: 'kitchen-2',
              },
            ],
          },
        ],
      },
    });

    const scopedOrder = kitchenEmit.mock.calls[0][1].order;
    expect(scopedOrder.items[0].comboSelections).toHaveLength(1);
    expect(scopedOrder).not.toHaveProperty('payments');
    expect(scopedOrder).not.toHaveProperty('customerPhone');
    expect(scopedOrder).not.toHaveProperty('total');
  });

  it('permite conectar al motorizado con delivery.read sin orders.read y notifica al repartidor y cocina previos al reasignar (B39, B40)', async () => {
    const driverUser: UserEntity = {
      ...activeUser,
      id: 'driver-9',
      username: 'moto9',
      role: UserRoleDto.motorizado,
    };
    findById.mockResolvedValue(driverUser);
    authorizationForUser.mockResolvedValue({
      accessRoleId: 'role-driver',
      accessRoleName: 'Motorizado',
      permissions: ['delivery.read', 'delivery.own'],
    });

    const { socket } = await connect();
    expect(socket.join).toHaveBeenCalledWith('authenticated-driver:driver-9');

    const prevDriverEmit = jest.fn();
    const nextDriverEmit = jest.fn();
    const prevKitchenEmit = jest.fn();
    const gateway = new OrdersGateway(
      jwtService,
      kitchens,
      accessControl,
      usersRepository,
    );
    gateway.afterInit({
      use: jest.fn(),
      to: jest.fn((room: string) => ({
        emit:
          room === 'authenticated-driver:driver-old'
            ? prevDriverEmit
            : room === 'authenticated-driver:driver-new'
              ? nextDriverEmit
              : room === 'authenticated-kitchen:kitchen-old'
                ? prevKitchenEmit
                : jest.fn(),
      })),
    } as never);

    await gateway.handleOrderSynchronized({
      mutation: 'updated',
      previousDriverId: 'driver-old',
      previousKitchenIds: ['kitchen-old'],
      order: {
        id: 'order-reassigned',
        status: 'pending' as never,
        orderType: 'delivery' as never,
        driverId: 'driver-new',
        total: 180,
        timestamp: new Date('2026-11-04T12:00:00.000Z'),
        items: [
          {
            id: 1,
            name: 'Pizza',
            size: 'Grande',
            price: 180,
            quantity: 1,
            giftQuantity: 0,
            extras: [],
            kitchenId: 'kitchen-new',
            isSentToKitchen: true,
          },
        ],
        payments: [],
      },
    });

    expect(prevDriverEmit).toHaveBeenCalledWith(
      'orders:changed',
      expect.objectContaining({
        order: expect.objectContaining({
          id: 'order-reassigned',
          driverId: undefined,
          items: [],
        }),
      }),
    );
    const previousDriverEvent = prevDriverEmit.mock.calls[0]?.[1] as {
      order: Record<string, unknown>;
    };
    expect(previousDriverEvent.order).not.toHaveProperty('payments');
    expect(previousDriverEvent.order).not.toHaveProperty(
      'customerSnapshotName',
    );
    expect(nextDriverEmit).toHaveBeenCalledTimes(1);
    expect(prevKitchenEmit).toHaveBeenCalledWith(
      'orders:changed',
      expect.objectContaining({
        order: expect.objectContaining({
          id: 'order-reassigned',
          items: [],
        }),
      }),
    );
  });
});
