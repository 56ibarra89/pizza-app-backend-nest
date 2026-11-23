import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OnEvent } from '@nestjs/event-emitter';
import { Subject } from 'rxjs';
import { type Prisma, UserRole } from '@prisma/client';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  DEFAULT_SERVICE_SLA_CONFIG,
  SERVICE_SLA_CONFIG_ID,
  normalizeServiceSlaConfig,
} from '../../common/service-sla.config';
import { SystemLogsService } from '../../system-logs/services/system-logs.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import {
  SECURITY_SOCKETS_REVALIDATE_EVENT,
  type SecuritySocketsRevalidateEvent,
} from '../../common';

const STREAM_SUBSCRIBER_CACHE_TTL_MS = 30_000;
const RECIPIENT_USER_SELECT = {
  username: true,
  role: true,
  isActive: true,
} as const;
const ORDER_CASHIER_SELECT = {
  cashierSnapshotName: true,
  cashier: { select: RECIPIENT_USER_SELECT },
  shift: {
    select: { status: true, cashier: { select: RECIPIENT_USER_SELECT } },
  },
} satisfies Prisma.OrderSelect;

type OrderCashierContext = Prisma.OrderGetPayload<{
  select: typeof ORDER_CASHIER_SELECT;
}>;
type Audience = { role: UserRole; targetUsername?: string };

export interface NotificationEvent {
  id: string;
  title: string;
  message: string;
  role: UserRole;
  targetUsername?: string | null;
  createdAt: Date;
  isRead: boolean;
  orderId?: string | null;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private checkingDeliverySlas = false;
  private readonly subscriberCache = new Map<
    string,
    {
      cachedAt: number;
      tokenVersion?: number;
      subscriber: { role: UserRole; username: string };
    }
  >();

  public readonly notificationStream = new Subject<NotificationEvent>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly systemLogs: SystemLogsService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async checkOverdueDeliveries() {
    if (this.checkingDeliverySlas) return;
    this.checkingDeliverySlas = true;
    try {
      const configRecord = await this.prisma.appConfig.findUnique({
        where: { id: SERVICE_SLA_CONFIG_ID },
        select: { data: true },
      });
      const config = normalizeServiceSlaConfig(
        configRecord?.data ?? DEFAULT_SERVICE_SLA_CONFIG,
      );
      if (!config.deliveryAlertsEnabled) return;

      const cutoff = new Date(
        Date.now() - config.deliveryMaxMinutes * 60 * 1000,
      );
      const overdueWhere: Prisma.OrderWhereInput = {
        orderType: 'DELIVERY',
        deliveryStartedAt: { not: null, lte: cutoff },
        deliveredAt: null,
        deliverySlaAlertedAt: null,
        status: { notIn: ['DELIVERED', 'PAID', 'CANCELLED'] },
      };
      const overdue = await this.prisma.order.findMany({
        where: overdueWhere,
        select: {
          ...ORDER_CASHIER_SELECT,
          id: true,
          invoiceNumber: true,
          customerSnapshotName: true,
          customerPhoneSnapshot: true,
          deliveryStartedAt: true,
          customer: { select: { phone: true } },
        },
      });

      const alertedOrderIds: string[] = [];
      for (const order of overdue) {
        const elapsedMinutes = Math.max(
          config.deliveryMaxMinutes,
          Math.floor(
            (Date.now() - (order.deliveryStartedAt?.getTime() ?? Date.now())) /
              60000,
          ),
        );
        const reference = order.invoiceNumber
          ? `#${order.invoiceNumber}`
          : `ORD-${order.id.slice(-6)}`;
        const customer = order.customerSnapshotName || 'el cliente';
        const contactPhone =
          order.customerPhoneSnapshot ?? order.customer?.phone;
        const phone = contactPhone ? ` Teléfono: ${contactPhone}.` : '';
        const title = 'Delivery fuera de tiempo';
        const message = `${reference} lleva ${elapsedMinutes} min en ruta para ${customer}.${phone} Contacta al cliente preventivamente.`;

        const audience: Audience[] = [
          { role: UserRole.ADMIN },
          { role: UserRole.CAJERO_PRINCIPAL },
          { role: UserRole.DESPACHADOR },
        ];
        const cashier = await this.resolveCashierUsername(order);
        if (cashier) {
          audience.push({ role: UserRole.CAJERO, targetUsername: cashier });
        }

        const notifications = await this.prisma.$transaction(async (tx) => {
          const claimed = await tx.order.updateMany({
            where: { ...overdueWhere, id: order.id },
            data: { deliverySlaAlertedAt: new Date() },
          });
          if (claimed.count === 0) return [];
          return this.storeOrderNotifications(
            tx,
            order.id,
            title,
            message,
            audience,
          );
        });
        if (notifications.length === 0) continue;

        for (const notification of notifications) {
          this.notificationStream.next(notification);
        }
        alertedOrderIds.push(order.id);
      }
      if (alertedOrderIds.length > 0) {
        await this.systemLogs.createProcess({
          process: 'DELIVERY_SLA_MONITOR',
          action: 'NOTIFICATIONS_DELIVERY_SLA_ALERT',
          module: 'notifications',
          operation: 'CREATE',
          entity: 'delivery-alert',
          after: { alertedOrderIds, count: alertedOrderIds.length },
        });
      }
    } catch (error) {
      this.logger.error('No se pudieron revisar los SLA de delivery.', error);
    } finally {
      this.checkingDeliverySlas = false;
    }
  }

  @OnEvent('order.ready')
  async handleOrderReadyEvent(payload: {
    orderId: string;
    itemName?: string;
    tableName?: string;
    isFullOrder?: boolean;
    customerName?: string;
  }) {
    this.logger.log(`Received order.ready event for order: ${payload.orderId}`);
    const title = payload.isFullOrder ? '¡Orden Lista!' : '¡Producto Listo!';

    let formattedTableName = payload.tableName;
    if (
      formattedTableName &&
      formattedTableName.startsWith('F') &&
      formattedTableName.includes('-M')
    ) {
      try {
        const parts = formattedTableName.split('-M');
        const floorId = parseInt(parts[0].substring(1), 10);
        const mesaNum = parts[1];

        const configRecord = await this.prisma.appConfig.findUnique({
          where: { id: 'floors_config' },
        });
        let floorName = `Planta ${floorId}`;

        if (configRecord && configRecord.data) {
          const floors = configRecord.data as Array<{
            id: number;
            name: string;
          }>;
          const floor = floors.find((f) => f.id === floorId);
          if (floor && floor.name) {
            floorName = floor.name;
          }
        }
        formattedTableName = `${floorName} - Mesa ${mesaNum}`;
      } catch (e) {
        this.logger.error('Error formatting table name for notification', e);
      }
    }

    const targetName = formattedTableName
      ? `la ${formattedTableName}`
      : payload.customerName
        ? payload.customerName
        : `ORD-${payload.orderId.slice(-4)}`;

    const message = payload.isFullOrder
      ? `La orden de ${targetName} está lista para ser entregada.`
      : `El producto "${payload.itemName}" de ${targetName} está listo.`;

    const order = await this.prisma.order.findUnique({
      where: { id: payload.orderId },
      select: {
        ...ORDER_CASHIER_SELECT,
        orderType: true,
        waiter: { select: RECIPIENT_USER_SELECT },
        driver: { select: RECIPIENT_USER_SELECT },
      },
    });
    if (!order) return;

    const audience: Audience[] = [
      { role: UserRole.CAJERO_PRINCIPAL },
      { role: UserRole.ADMIN },
    ];
    const cashier = await this.resolveCashierUsername(order);
    if (cashier) {
      audience.push({ role: UserRole.CAJERO, targetUsername: cashier });
    }
    const { waiter, driver } = order;
    if (waiter?.isActive && waiter.role === UserRole.MESERO) {
      audience.push({ role: UserRole.MESERO, targetUsername: waiter.username });
    }
    if (order.orderType === 'DELIVERY') {
      audience.push({ role: UserRole.DESPACHADOR });
      if (driver?.isActive && driver.role === UserRole.MOTORIZADO) {
        audience.push({
          role: UserRole.MOTORIZADO,
          targetUsername: driver.username,
        });
      }
    }

    const notifications = await this.storeOrderNotifications(
      this.prisma,
      payload.orderId,
      title,
      message,
      audience,
    );
    for (const notification of notifications) {
      this.notificationStream.next(notification);
    }
  }

  private async resolveCashierUsername(order: OrderCashierContext) {
    const snapshotUsername = order.cashierSnapshotName?.trim().toLowerCase();
    const cashier =
      order.cashier ??
      (snapshotUsername
        ? await this.prisma.user.findUnique({
            where: { username: snapshotUsername },
            select: RECIPIENT_USER_SELECT,
          })
        : null);
    if (cashier?.isActive && cashier.role === UserRole.CAJERO) {
      return cashier.username;
    }

    const shiftCashier = order.shift?.cashier;
    if (
      order.shift?.status === 'OPEN' &&
      shiftCashier?.isActive &&
      shiftCashier.role === UserRole.CAJERO
    ) {
      return shiftCashier.username;
    }
    return undefined;
  }

  private storeOrderNotifications(
    client: Prisma.TransactionClient,
    orderId: string,
    title: string,
    message: string,
    audience: Audience[],
  ) {
    return client.notification.createManyAndReturn({
      data: audience.map((recipient) => ({
        ...recipient,
        orderId,
        title,
        message,
      })),
    });
  }

  async getRecentForRole(role: UserRole, username?: string) {
    if (role === UserRole.CAJERO_PRINCIPAL) {
      return this.prisma.notification.findMany({
        where: {
          role: UserRole.CAJERO_PRINCIPAL,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 50,
      });
    }

    if (
      role === UserRole.MOTORIZADO ||
      role === UserRole.CAJERO ||
      role === UserRole.MESERO
    ) {
      return this.prisma.notification.findMany({
        where: {
          role,
          ...(role === UserRole.CAJERO || role === UserRole.MESERO
            ? {
                OR: [
                  { targetUsername: username },
                  { targetUsername: username?.toLowerCase() },
                ],
              }
            : {
                targetUsername: username ?? '',
              }),
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 50,
      });
    }

    return this.prisma.notification.findMany({
      where: {
        role,
        OR: [{ targetUsername: null }, { targetUsername: username }],
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 50,
    });
  }

  async markAsReadForUser(id: string, role: UserRole, username: string) {
    const result = await this.prisma.notification.updateMany({
      where: this.buildAudienceFilter(id, role, username),
      data: { isRead: true },
    });

    this.assertNotificationAccess(result.count);
    return { success: true };
  }

  async deleteNotificationForUser(
    id: string,
    role: UserRole,
    username: string,
  ) {
    const result = await this.prisma.notification.deleteMany({
      where: this.buildAudienceFilter(id, role, username),
    });

    this.assertNotificationAccess(result.count);
    return { success: true };
  }

  private buildAudienceFilter(id: string, role: UserRole, username: string) {
    if (role === UserRole.CAJERO_PRINCIPAL || role === UserRole.ADMIN) {
      return { id };
    }

    return {
      id,
      role,
      ...(role === UserRole.MOTORIZADO ||
      role === UserRole.CAJERO ||
      role === UserRole.MESERO
        ? {
            OR: [
              { targetUsername: username },
              { targetUsername: username.toLowerCase() },
            ],
          }
        : {
            OR: [{ targetUsername: null }, { targetUsername: username }],
          }),
    };
  }

  private assertNotificationAccess(affectedRows: number) {
    if (affectedRows === 0) {
      throw new NotFoundException('Notificación no encontrada.');
    }
  }

  @OnEvent(SECURITY_SOCKETS_REVALIDATE_EVENT)
  handleSecuritySocketsRevalidate(
    payload?: SecuritySocketsRevalidateEvent,
  ): void {
    if (payload?.userId) {
      this.subscriberCache.delete(payload.userId);
      return;
    }
    this.subscriberCache.clear();
  }

  async validateStreamSubscriber(
    user: AuthenticatedUser,
  ): Promise<{ role: UserRole; username: string } | null> {
    if (
      typeof user.tokenExpiresAtMs === 'number' &&
      Date.now() >= user.tokenExpiresAtMs
    ) {
      this.subscriberCache.delete(user.id);
      return null;
    }

    if (!this.prisma.user?.findUnique) {
      return {
        role: user.role.toUpperCase() as UserRole,
        username: user.username,
      };
    }

    const now = Date.now();
    const cached = this.subscriberCache.get(user.id);
    if (
      cached &&
      now - cached.cachedAt < STREAM_SUBSCRIBER_CACHE_TTL_MS &&
      (typeof user.tokenVersion !== 'number' ||
        cached.tokenVersion === user.tokenVersion)
    ) {
      return cached.subscriber;
    }

    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: {
        isActive: true,
        tokenVersion: true,
        role: true,
        username: true,
      },
    });
    if (!dbUser || !dbUser.isActive) {
      this.subscriberCache.delete(user.id);
      return null;
    }
    if (
      typeof user.tokenVersion === 'number' &&
      dbUser.tokenVersion !== user.tokenVersion
    ) {
      this.subscriberCache.delete(user.id);
      return null;
    }

    const subscriber = {
      role: dbUser.role,
      username: dbUser.username,
    };
    this.subscriberCache.set(user.id, {
      cachedAt: now,
      tokenVersion: dbUser.tokenVersion,
      subscriber,
    });
    return subscriber;
  }
}
