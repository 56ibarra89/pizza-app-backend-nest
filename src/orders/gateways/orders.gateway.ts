import { Inject, Logger } from '@nestjs/common';
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
  toKitchenOrderResponseDto,
  toOrderResponseDto,
} from '../mappers/orders.mapper';
import {
  USERS_REPOSITORY,
  type IUsersRepository,
} from '../../users/interfaces/users.repository';
import { UserRoleDto } from '../../common';
import { KitchensService } from '../../kitchens/kitchens.service';
import { requiresKitchenPreparation } from '../validators/order-item-kind';
import { AccessControlService } from '../../access-control/access-control.service';

const FULL_ORDERS_ROOM = 'authenticated-full-orders-clients';
const ORDERS_READ_PERMISSION = 'orders.read';
const kitchenRoom = (kitchenId: string) => `authenticated-kitchen:${kitchenId}`;

const configuredOrigins = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const socketCorsOrigin =
  process.env.NODE_ENV !== 'production'
    ? true
    : configuredOrigins.length > 0
      ? configuredOrigins
      : false;

interface OrderSocketJwtPayload {
  sub: string;
  tokenVersion: number;
  type: 'access';
}

interface OrdersServerToClientEvents {
  'orders:changed': (event: {
    mutation: OrderSynchronizedEvent['mutation'];
    order:
      | ReturnType<typeof toOrderResponseDto>
      | NonNullable<ReturnType<typeof toKitchenOrderResponseDto>>;
    occurredAt: string;
  }) => void;
}

interface OrderSocketData {
  token?: string;
  joinedRoom?: string;
  user?: {
    id: string;
    username: string;
    role: UserRoleDto;
    permissions: string[];
  };
}

type OrdersSocket = Socket<
  Record<string, never>,
  OrdersServerToClientEvents,
  Record<string, never>,
  OrderSocketData
>;

type OrdersSocketServer = Server<
  Record<string, never>,
  OrdersServerToClientEvents,
  Record<string, never>,
  OrderSocketData
>;

@WebSocketGateway({
  namespace: '/orders',
  cors: {
    origin: socketCorsOrigin,
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
  ) {}

  afterInit(server: OrdersSocketServer): void {
    this.server = server;
    server.use((socket, next) => {
      void this.authenticate(socket)
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

  @OnEvent(ORDER_SYNCHRONIZED_EVENT)
  async handleOrderSynchronized(event: OrderSynchronizedEvent): Promise<void> {
    await this.revalidateConnectedSockets();
    const occurredAt = new Date().toISOString();
    this.server.to(FULL_ORDERS_ROOM).emit('orders:changed', {
      mutation: event.mutation,
      order: toOrderResponseDto(event.order),
      occurredAt,
    });

    const kitchenIds = new Set(
      event.order.items.flatMap((item) => {
        if (!requiresKitchenPreparation(item)) return [];
        const ids: string[] = [];
        if (item.kitchenId) ids.push(item.kitchenId);
        if (item.isCombo && Array.isArray(item.comboSelections)) {
          item.comboSelections.forEach((sel) => {
            if (sel.kitchenId) ids.push(sel.kitchenId);
          });
        }
        return ids;
      }),
    );

    kitchenIds.forEach((kitchenId) => {
      const scopedOrder = toKitchenOrderResponseDto(event.order, kitchenId);
      if (!scopedOrder) return;
      this.server.to(kitchenRoom(kitchenId)).emit('orders:changed', {
        mutation: event.mutation,
        order: scopedOrder,
        occurredAt,
      });
    });
  }

  private trackConnectedSocket(socket: OrdersSocket): void {
    this.connectedSockets.add(socket);
    socket.on?.('disconnect', () => {
      this.connectedSockets.delete(socket);
    });
  }

  private async revalidateConnectedSockets(): Promise<void> {
    const sockets = Array.from(this.connectedSockets);
    await Promise.all(
      sockets.map(async (socket) => {
        try {
          await this.authenticate(socket);
          await this.reconcileAuthorizedRooms(socket);
        } catch {
          const previousRoom = socket.data.joinedRoom;
          if (previousRoom) {
            await socket.leave?.(previousRoom);
            socket.data.joinedRoom = undefined;
          }
          this.connectedSockets.delete(socket);
          socket.disconnect?.(true);
        }
      }),
    );
  }

  private async reconcileAuthorizedRooms(socket: OrdersSocket): Promise<void> {
    const user = socket.data.user;
    if (!user) throw new Error('Usuario no autenticado');

    let targetRoom: string | undefined;
    if (user.role === UserRoleDto.motorizado) {
      targetRoom = undefined;
    } else if (user.role !== UserRoleDto.cocinero) {
      targetRoom = FULL_ORDERS_ROOM;
    } else {
      const assignedKitchenId = await this.kitchens.getAssignedKitchenIdForDate(
        user.id,
      );
      targetRoom = assignedKitchenId
        ? kitchenRoom(assignedKitchenId)
        : undefined;
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

  private async authenticate(socket: OrdersSocket): Promise<void> {
    const token = socket.data.token ?? this.extractToken(socket);
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
    if (!authorization.permissions.includes(ORDERS_READ_PERMISSION)) {
      this.logger.warn(
        `Conexion de ordenes rechazada por permiso faltante: ${user.id}`,
      );
      throw new Error('Permiso de ordenes insuficiente');
    }

    socket.data.token = token;
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
