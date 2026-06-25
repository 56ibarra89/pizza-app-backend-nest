import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OnEvent } from '@nestjs/event-emitter';
import { Subject } from 'rxjs';
import { UserRole } from '@prisma/client';

export interface NotificationEvent {
  id: string;
  title: string;
  message: string;
  role: UserRole;
  createdAt: Date;
  isRead: boolean;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  
  // Subject for SSE
  public readonly notificationStream = new Subject<NotificationEvent>();

  constructor(private readonly prisma: PrismaService) {}

  @OnEvent('order.ready')
  async handleOrderReadyEvent(payload: { orderId: string, itemName?: string, tableName?: string, isFullOrder?: boolean, customerName?: string, orderType?: string }) {
    this.logger.log(`Received order.ready event for order: ${payload.orderId}`);
    
    let title = payload.isFullOrder ? '¡Orden Lista!' : '¡Producto Listo!';
    
    const targetName = payload.customerName ? payload.customerName : `ORD-${payload.orderId.substring(0, 4).toUpperCase()}`;

    let message = payload.isFullOrder 
      ? `La orden de ${targetName} está lista para ser entregada.`
      : `El producto "${payload.itemName}" de ${targetName} está listo.`;

    if (payload.tableName) {
      message += ` (Mesa: ${payload.tableName})`;
    }

    // Guardamos notificación para CAJERO
    await this.createNotification(title, message, 'CAJERO');
    // Guardamos notificación para ADMIN
    await this.createNotification(title, message, 'ADMIN');
    
    // Guardamos notificación para DESPACHADOR solo si es delivery
    if (payload.orderType === 'delivery') {
      await this.createNotification(title, message, 'DESPACHADOR');
    }
  }

  async createNotification(title: string, message: string, role: UserRole) {
    const notification = await this.prisma.notification.create({
      data: {
        title,
        message,
        role,
      }
    });

    // Emitir al SSE
    this.notificationStream.next(notification);
  }

  async getRecentForRole(role: UserRole) {
    return this.prisma.notification.findMany({
      where: {
        role,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 50,
    });
  }

  async markAsRead(id: string) {
    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true }
    });
  }

  async deleteNotification(id: string) {
    return this.prisma.notification.delete({
      where: { id }
    });
  }
}
