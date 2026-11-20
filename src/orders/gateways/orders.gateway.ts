import { Inject, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OnEvent } from '@nestjs/event-emitter';
import {
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import {
  ORDER_SYNCHRONIZED_EVENT,
  type OrderSynchronizedEvent,
} from '../events/order-synchronized.event';
import {
  collectOrderKitchenIds,
  toKitchenClearedOrderResponseDto,
  toDriverClearedOrderResponseDto,
  toKitchenOrderResponseDto,
  toOrderResponseDto,
} from '../mappers/orders.mapper';
import {
  USERS_REPOSITORY,
  type IUsersRepository,
} from '../../users/interfaces/users.repository';
import {
  SECURITY_SOCKETS_REVALIDATE_EVENT,
  type SecuritySocketsRevalidateEvent,
  UserRoleDto,
} from '../../common';
import { KitchensService } from '../../kitchens/kitchens.service';
import { AccessControlService } from '../../access-control/access-control.service';
import { OrderTypeDto } from '../dto/order-type.dto';

const FULL_ORDERS_ROOM = 'authenticated-full-orders-clients';
const DELIVERIES_ROOM = 'authenticated-delivery-clients';
const ORDERS_READ_PERMISSION = 'orders.read';
const DELIVERY_READ_PERMISSION = 'delivery.read';
const DELIVERY_OWN_PERMISSION = 'delivery.own';
const REVALIDATION_TTL_MS = 30_000;
const kitchenRoom = (kitchenId: string) => `authenticated-kitchen:${kitchenId}`;
const driverRoom = (driverId: string) => `authenticated-driver:${driverId}`;
const DELIVERY_LIST_ROLES: readonly (UserRoleDto | string)[] = [
  UserRoleDto.admin,
  UserRoleDto.cajero,
  UserRoleDto.cajero_principal,
  UserRoleDto.despachador,
];

function hasOrdersSocketAccess(
  role: UserRoleDto | string,
  permissions: readonly string[],
): boolean {
  if (permissions.includes(ORDERS_READ_PERMISSION)) {
    return true;
  }
  if (role === UserRoleDto.motorizado) {
    return (
      permissions.includes(DELIVERY_READ_PERMISSION) ||
      permissions.includes(DELIVERY_OWN_PERMISSION)
    );
  }
  return (
    DELIVERY_LIST_ROLES.includes(role) &&
    permissions.includes(DELIVERY_READ_PERMISSION)
  );
}

let activeCorsOriginChecker:
  | ((origin: string | undefined) => boolean)
  | undefined;

interface OrderSocketJwtPayload {
  sub: string;
  tokenVersion: number;
  type: 'access';
}

interface OrdersClientToServerEvents {
  'auth:refresh': (payload?: { token?: string }) => void;
}

interface OrdersServerToClientEvents {
  'orders:changed': (event: {
    mutation: OrderSynchronizedEvent['mutation'];
    order:
      | ReturnType<typeof toOrderResponseDto>
      | NonNullable<ReturnType<typeof toKitchenOrderResponseDto>>
      | ReturnType<typeof toKitchenClearedOrderResponseDto>
      | ReturnType<typeof toDriverClearedOrderResponseDto>;
    occurredAt: string;
  }) => void;
}

interface OrderSocketData {
  token?: string;
  joinedRoom?: string;
  validatedAt?: number;
  user?: {
    id: string;
    username: string;
    role: UserRoleDto;
    permissions: string[];
  };
}

type OrdersSocket = Socket<
  OrdersClientToServerEvents,
  OrdersServerToClientEvents,
  Record<string, never>,
  OrderSocketData
>;

type OrdersSocketServer = Server<
  OrdersClientToServerEvents,
  OrdersServerToClientEvents,
  Record<string, never>,
  OrderSocketData
>;

@WebSocketGateway({
  namespace: '/orders',
  cors: {
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      const checker = activeCorsOriginChecker;
      if (checker?.(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Origin not allowed by CORS'));
    },
  },
})
export class OrdersGateway implements OnGatewayInit {
  private readonly logger = new Logger(OrdersGateway.name);
  private readonly connectedSockets = new Set<OrdersSocket>();

  @WebSocketServer()
  private server: OrdersSocketServer;

  constructor(
    private readonly jwtService: JwtService,
    private readonly kitchens: KitchensService,
    private readonly accessControl: AccessControlService,
    @Inject(USERS_REPOSITORY)
    private readonly usersRepository: IUsersRepository,
    @Optional()
    private readonly configService?: ConfigService,
  ) {
    activeCorsOriginChecker = (origin) => this.isOriginAllowed(origin);
  }

  isOriginAllowed(origin?: string): boolean {
    const rawCorsOrigins =
      this.configService?.get<string>('CORS_ORIGINS') ?? '';
    const corsOrigins = rawCorsOrigins
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    const apiHost =
      this.configService?.get<string>('API_HOST')?.trim() || '127.0.0.1';
    const isLoopback = ['127.0.0.1', 'localhost', '::1'].includes(apiHost);
    const allowedOrigins = new Set(
      corsOrigins.length > 0
        ? corsOrigins
        : isLoopback
          ? [
              'http://localhost:5173',
              'http://127.0.0.1:5173',
              'file://',
              'null',
            ]
          : [],
    );
    if (allowedOrigins.size === 0) {
      return false;
    }
    return !origin || allowedOrigins.has(origin);
  }

  afterInit(server: OrdersSocketServer): void {
    this.server = server;
    server.use((socket, next) => {
      void this.authenticate(socket, this.extractToken(socket))
        .then(async () => {
          await this.reconcileAuthorizedRooms(socket);
          this.trackConnectedSocket(socket);
          next();
        })
        .catch(() => {
          next(new Error('Acceso no autorizado al canal de ordenes'));
        });
    });
  }

  @OnEvent(SECURITY_SOCKETS_REVALIDATE_EVENT)
  async handleSecurityRevalidation(
    payload?: SecuritySocketsRevalidateEvent,
  ): Promise<void> {
    await this.revalidateConnectedSockets({
      force: true,
      userId: payload?.userId,
    });
  }

  @OnEvent(ORDER_SYNCHRONIZED_EVENT)
  async handleOrderSynchronized(event: OrderSynchronizedEvent): Promise<void> {
    await this.revalidateConnectedSockets({ maxAgeMs: REVALIDATION_TTL_MS });
    const occurredAt = new Date().toISOString();
    const fullOrderDto = toOrderResponseDto(event.order);
    this.server.to(FULL_ORDERS_ROOM).emit('orders:changed', {
      mutation: event.mutation,
      order: fullOrderDto,
      occurredAt,
    });

    if (event.order.orderType === OrderTypeDto.delivery) {
      const payload = {
        mutation: event.mutation,
        order: fullOrderDto,
        occurredAt,
      };
      this.server.to(DELIVERIES_ROOM).emit('orders:changed', payload);
      if (event.order.driverId) {
        this.server
          .to(driverRoom(event.order.driverId))
          .emit('orders:changed', payload);
      }
    }

    if (
      event.previousDriverId &&
      (event.order.orderType !== OrderTypeDto.delivery ||
        event.previousDriverId !== event.order.driverId)
    ) {
      this.server
        .to(driverRoom(event.previousDriverId))
        .emit('orders:changed', {
          mutation: event.mutation,
          order: toDriverClearedOrderResponseDto(event.order),
          occurredAt,
        });
    }

    const kitchenIds = new Set(collectOrderKitchenIds(event.order));

    kitchenIds.forEach((kitchenId) => {
      const scopedOrder = toKitchenOrderResponseDto(event.order, kitchenId);
      if (!scopedOrder) return;
      this.server.to(kitchenRoom(kitchenId)).emit('orders:changed', {
        mutation: event.mutation,
        order: scopedOrder,
        occurredAt,
      });
    });

    if (event.previousKitchenIds?.length) {
      const clearedOrder = toKitchenClearedOrderResponseDto(event.order);
      new Set(event.previousKitchenIds).forEach((previousKitchenId) => {
        if (kitchenIds.has(previousKitchenId)) return;
        this.server.to(kitchenRoom(previousKitchenId)).emit('orders:changed', {
          mutation: event.mutation,
          order: clearedOrder,
          occurredAt,
        });
      });
    }
  }

  private trackConnectedSocket(socket: OrdersSocket): void {
    this.connectedSockets.add(socket);
    socket.on?.('disconnect', () => {
      this.connectedSockets.delete(socket);
    });
    socket.on?.('auth:refresh', (payload) => {
      const nextToken =
        typeof payload?.token === 'string' && payload.token.trim().length > 0
          ? payload.token.trim()
          : undefined;
      if (!nextToken) {
        void this.disconnectUnauthorizedSocket(socket);
        return;
      }
      void this.authenticate(socket, nextToken, false)
        .then(() => this.reconcileAuthorizedRooms(socket))
        .catch(() => this.disconnectUnauthorizedSocket(socket));
    });
  }

  private async disconnectUnauthorizedSocket(
    socket: OrdersSocket,
  ): Promise<void> {
    const previousRoom = socket.data.joinedRoom;
    if (previousRoom) {
      await socket.leave?.(previousRoom);
      socket.data.joinedRoom = undefined;
    }
    this.connectedSockets.delete(socket);
    socket.disconnect?.(true);
  }

  private async revalidateConnectedSockets(options?: {
    force?: boolean;
    maxAgeMs?: number;
    userId?: string;
  }): Promise<void> {
    const now = Date.now();
    const sockets = Array.from(this.connectedSockets);
    await Promise.all(
      sockets.map(async (socket) => {
        if (options?.userId && socket.data.user?.id !== options.userId) {
          return;
        }
        if (
          !options?.force &&
          options?.maxAgeMs !== undefined &&
          typeof socket.data.validatedAt === 'number' &&
          now - socket.data.validatedAt < options.maxAgeMs
        ) {
          return;
        }
        try {
          await this.authenticate(socket, undefined, true);
          await this.reconcileAuthorizedRooms(socket);
        } catch {
          await this.disconnectUnauthorizedSocket(socket);
        }
      }),
    );
  }

  private async reconcileAuthorizedRooms(socket: OrdersSocket): Promise<void> {
    const user = socket.data.user;
    if (!user) throw new Error('Usuario no autenticado');

    let targetRoom: string | undefined;
    if (user.role === UserRoleDto.motorizado) {
      targetRoom = driverRoom(user.id);
    } else if (user.role === UserRoleDto.cocinero) {
      const assignedKitchenId = await this.kitchens.getAssignedKitchenIdForDate(
        user.id,
      );
      targetRoom = assignedKitchenId
        ? kitchenRoom(assignedKitchenId)
        : undefined;
    } else {
      targetRoom = user.permissions.includes(ORDERS_READ_PERMISSION)
        ? FULL_ORDERS_ROOM
        : DELIVERIES_ROOM;
    }

    const previousRoom = socket.data.joinedRoom;
    if (previousRoom && previousRoom !== targetRoom) {
      await socket.leave?.(previousRoom);
      socket.data.joinedRoom = undefined;
    }

    if (targetRoom && previousRoom !== targetRoom) {
      await socket.join(targetRoom);
      socket.data.joinedRoom = targetRoom;
    }
  }

  private async authenticate(
    socket: OrdersSocket,
    tokenOverride?: string,
    allowStoredToken = true,
  ): Promise<void> {
    const token =
      tokenOverride ??
      (allowStoredToken
        ? (socket.data.token ?? this.extractToken(socket))
        : this.extractToken(socket));
    if (!token) {
      throw new Error('Token ausente');
    }

    const payload =
      await this.jwtService.verifyAsync<OrderSocketJwtPayload>(token);
    if (
      payload.type !== 'access' ||
      typeof payload.sub !== 'string' ||
      !Number.isInteger(payload.tokenVersion)
    ) {
      throw new Error('Tipo de token inválido');
    }
    const user = await this.usersRepository.findById(payload.sub);

    if (!user || !user.isActive || user.tokenVersion !== payload.tokenVersion) {
      this.logger.warn('Conexion de ordenes rechazada por sesion invalida');
      throw new Error('Sesion invalida');
    }

    const authorization = await this.accessControl.authorizationForUser(
      user.id,
    );
    if (!hasOrdersSocketAccess(user.role, authorization.permissions)) {
      this.logger.warn(
        `Conexion de ordenes rechazada por permiso faltante: ${user.id}`,
      );
      throw new Error('Permiso de ordenes insuficiente');
    }

    socket.data.token = token;
    socket.data.validatedAt = Date.now();
    socket.data.user = {
      id: user.id,
      username: user.username,
      role: user.role,
      permissions: authorization.permissions,
    };
  }

  private extractToken(socket: OrdersSocket): string | undefined {
    const handshakeAuth = socket.handshake.auth as Record<string, unknown>;
    const handshakeToken = handshakeAuth.token;
    if (typeof handshakeToken === 'string' && handshakeToken.length > 0) {
      return handshakeToken;
    }

    const authorization = socket.handshake.headers.authorization;
    if (typeof authorization !== 'string') return undefined;

    const [scheme, token] = authorization.split(' ');
    return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
  }
}
