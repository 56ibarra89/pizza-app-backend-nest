import {
  Controller,
  Sse,
  MessageEvent,
  UseGuards,
  Get,
  Delete,
  Param,
  Patch,
} from '@nestjs/common';
import { NotificationsService } from '../services/notifications.service';
import { UserRole } from '@prisma/client';
import { Observable } from 'rxjs';
import { map, filter } from 'rxjs/operators';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @UseGuards(JwtAuthGuard)
  @Sse('stream')
  stream(
    @CurrentUser() user: { role: string; username: string },
  ): Observable<MessageEvent> {
    return this.notificationsService.notificationStream.asObservable().pipe(
      filter(
        (notification) =>
          notification.role === user.role.toUpperCase() &&
          (!notification.targetUsername ||
            notification.targetUsername === user.username),
      ),
      map((notification) => ({
        data: notification,
      })),
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async getRecentNotifications(
    @CurrentUser() user: { role: string; username: string },
  ) {
    // Convierte el rol a mayúsculas para coincidir con el enum UserRole de Prisma (ej. ADMIN, CAJERO)
    return this.notificationsService.getRecentForRole(
      user.role.toUpperCase() as UserRole,
      user.username,
    );
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
