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
import { toOrderResponseDto } from '../mappers/orders.mapper';
import {
  USERS_REPOSITORY,
  type IUsersRepository,
} from '../../users/interfaces/users.repository';
import { UserRoleDto } from '../../users/dto/user-role.dto';
import { KitchensService } from '../../kitchens/kitchens.service';
import { requiresKitchenPreparation } from '../validators/order-item-kind';

const FULL_ORDERS_ROOM = 'authenticated-full-orders-clients';
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
}

interface OrdersServerToClientEvents {
  'orders:changed': (event: {
    mutation: OrderSynchronizedEvent['mutation'];
    order: ReturnType<typeof toOrderResponseDto>;
    occurredAt: string;
  }) => void;
}

interface OrderSocketData {
  user?: {
    id: string;
    username: string;
    role: UserRoleDto;
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

  @WebSocketServer()
  private server: OrdersSocketServer;

  constructor(
    private readonly jwtService: JwtService,
    private readonly kitchens: KitchensService,
    @Inject(USERS_REPOSITORY)
    private readonly usersRepository: IUsersRepository,
  ) {}

  afterInit(server: OrdersSocketServer): void {
    server.use((socket, next) => {
      void this.authenticate(socket)
        .then(async () => {
          await this.joinAuthorizedRoom(socket);
          next();
        })
        .catch(() => {
          next(new Error('Acceso no autorizado al canal de ordenes'));
        });
    });
  }

  @OnEvent(ORDER_SYNCHRONIZED_EVENT)
  handleOrderSynchronized(event: OrderSynchronizedEvent): void {
    const occurredAt = new Date().toISOString();
    this.server.to(FULL_ORDERS_ROOM).emit('orders:changed', {
      mutation: event.mutation,
      order: toOrderResponseDto(event.order),
      occurredAt,
    });

    const kitchenIds = new Set(
      event.order.items.flatMap((item) =>
        requiresKitchenPreparation(item) && item.kitchenId
          ? [item.kitchenId]
          : [],
      ),
    );

    kitchenIds.forEach((kitchenId) => {
      const scopedOrder = {
        ...event.order,
        items: event.order.items.filter(
          (item) =>
            !requiresKitchenPreparation(item) || item.kitchenId === kitchenId,
        ),
      };
      this.server.to(kitchenRoom(kitchenId)).emit('orders:changed', {
        mutation: event.mutation,
        order: toOrderResponseDto(scopedOrder),
        occurredAt,
      });
    });
  }

  private async joinAuthorizedRoom(socket: OrdersSocket): Promise<void> {
    const user = socket.data.user;
    if (!user) throw new Error('Usuario no autenticado');

    if (user.role === UserRoleDto.motorizado) {
      return;
    }

    if (user.role !== UserRoleDto.cocinero) {
      await socket.join(FULL_ORDERS_ROOM);
      return;
    }

    const assignedKitchenId = await this.kitchens.getAssignedKitchenIdForDate(
      user.id,
    );
    if (assignedKitchenId) {
      await socket.join(kitchenRoom(assignedKitchenId));
    }
  }

  private async authenticate(socket: OrdersSocket): Promise<void> {
    const token = this.extractToken(socket);
    if (!token) {
      throw new Error('Token ausente');
    }

    const payload =
      await this.jwtService.verifyAsync<OrderSocketJwtPayload>(token);
    const user = await this.usersRepository.findById(payload.sub);

    if (!user || !user.isActive || user.tokenVersion !== payload.tokenVersion) {
      this.logger.warn('Conexion de ordenes rechazada por sesion invalida');
      throw new Error('Sesion invalida');
    }

    socket.data.user = {
      id: user.id,
      username: user.username,
      role: user.role,
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
