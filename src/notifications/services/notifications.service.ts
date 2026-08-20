import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OnEvent } from '@nestjs/event-emitter';
import { Subject } from 'rxjs';
import { UserRole } from '@prisma/client';

export interface NotificationEvent {
  id: string;
  title: string;
  message: string;
  role: UserRole;
  targetUsername?: string | null;
  createdAt: Date;
  isRead: boolean;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  public readonly notificationStream = new Subject<NotificationEvent>();

  constructor(private readonly prisma: PrismaService) {}

  @OnEvent('order.ready')
  async handleOrderReadyEvent(payload: {
    orderId: string;
    itemName?: string;
    tableName?: string;
    isFullOrder?: boolean;
    customerName?: string;
    orderType?: string;
    targetUsername?: string;
    driverId?: string;
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

    // Guardamos notificación para CAJERO (dirigida al cajero que generó la orden)
    await this.createNotification(
      title,
      message,
      UserRole.CAJERO,
      payload.targetUsername,
    );
    // Guardamos notificación para CAJERO_PRINCIPAL
    await this.createNotification(title, message, UserRole.CAJERO_PRINCIPAL);
    // Guardamos notificación para ADMIN
    await this.createNotification(title, message, UserRole.ADMIN);
    // Guardamos notificación para MESERO (dirigida al usuario específico si existe)
    await this.createNotification(
      title,
      message,
      UserRole.MESERO,
      payload.targetUsername,
    );

    // Guardamos notificación para DESPACHADOR solo si es delivery
    if (payload.orderType === 'delivery') {
      await this.createNotification(title, message, UserRole.DESPACHADOR);

      if (payload.driverId) {
        const driver = await this.prisma.user.findUnique({
          where: { id: payload.driverId },
          select: { username: true, role: true, isActive: true },
        });

        if (driver?.isActive && driver.role === UserRole.MOTORIZADO) {
          await this.createNotification(
            title,
            message,
            UserRole.MOTORIZADO,
            driver.username,
          );
        }
      }
    }
  }

  async createNotification(
    title: string,
    message: string,
    role: UserRole,
    targetUsername?: string,
  ) {
    const notification = await this.prisma.notification.create({
      data: {
        title,
        message,
        role,
        targetUsername,
      },
    });

    // Emitir al SSE
    this.notificationStream.next(notification);
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
}

