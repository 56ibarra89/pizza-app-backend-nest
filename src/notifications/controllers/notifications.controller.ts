import { Controller, Sse, MessageEvent, UseGuards, Get, Delete, Param } from '@nestjs/common';
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
      filter(notification => notification.role === user.role),
      map((notification) => ({
        data: notification,
      }) as MessageEvent),
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async getUnreadNotifications(@CurrentUser() user: any) {
    return this.notificationsService.getUnreadForRole(user.role);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async deleteNotification(@Param('id') id: string) {
    return this.notificationsService.deleteNotification(id);
  }
}
