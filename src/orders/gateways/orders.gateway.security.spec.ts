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

    return { gateway, next, socket, emit };
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

  it('desconecta y retira del canal un socket cuya sesión fue revocada antes de emitir cambios (H10)', async () => {
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

    await gateway.handleOrderSynchronized({
      mutation: 'updated',
      order: {
        id: 'order-1',
        status: 'pending' as never,
        total: 100,
        timestamp: new Date('2026-10-24T12:00:00.000Z'),
        items: [],
        payments: [],
      },
    });

    expect(socket.leave).toHaveBeenCalledWith(
      'authenticated-full-orders-clients',
    );
    expect(socket.disconnect).toHaveBeenCalledWith(true);
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
});
