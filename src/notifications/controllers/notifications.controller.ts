import { Controller, Sse, MessageEvent, UseGuards, Get, Delete, Param, Patch } from '@nestjs/common';
import { NotificationsService, NotificationEvent } from '../services/notifications.service';
import { Observable } from 'rxjs';
import { map, filter } from 'rxjs/operators';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @UseGuards(JwtAuthGuard)
  @Sse('stream')
  stream(@CurrentUser() user: any): Observable<MessageEvent> {
    return this.notificationsService.notificationStream.asObservable().pipe(
      filter(notification => notification.role === user.role.toUpperCase()),
      map((notification) => ({
        data: notification,
      }) as MessageEvent),
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async getRecentNotifications(@CurrentUser() user: any) {
    // Convierte el rol a mayúsculas para coincidir con el enum UserRole de Prisma (ej. ADMIN, CAJERO)
    return this.notificationsService.getRecentForRole(user.role.toUpperCase());
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async deleteNotification(@Param('id') id: string) {
    return this.notificationsService.deleteNotification(id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/read')
  async markAsRead(@Param('id') id: string) {
    return this.notificationsService.markAsRead(id);
  }
}
