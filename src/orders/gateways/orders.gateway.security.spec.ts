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
    const server = {
      use: (middleware: GatewayMiddleware) => {
        middlewareRef.current = middleware;
      },
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
    };
    const next = jest.fn();

    middleware(socket, next);
    await new Promise<void>((resolve) => setImmediate(resolve));

    return { next, socket };
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
});
