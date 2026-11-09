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
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRoleDto } from '../../common';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';

@Roles(
  UserRoleDto.admin,
  UserRoleDto.cajero,
  UserRoleDto.cajero_principal,
  UserRoleDto.mesero,
  UserRoleDto.motorizado,
  UserRoleDto.despachador,
)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @UseGuards(JwtAuthGuard)
  @Sse('stream')
  stream(@CurrentUser() user: AuthenticatedUser): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      const subscription =
        this.notificationsService.notificationStream.subscribe({
          next: (notification) => {
            if (
              typeof user.tokenExpiresAtMs === 'number' &&
              Date.now() >= user.tokenExpiresAtMs
            ) {
              subscriber.complete();
              return;
            }

            const expectedRole = user.role.toUpperCase() as UserRole;
            if (notification.role !== expectedRole) {
              return;
            }

            void this.notificationsService
              .validateStreamSubscriber(user)
              .then((activeSession) => {
                if (!activeSession) {
                  subscriber.complete();
                  return;
                }

                const { role, username } = activeSession;
                if (notification.role !== role) {
                  return;
                }

                if (
                  role === UserRole.MOTORIZADO ||
                  role === UserRole.CAJERO ||
                  role === UserRole.MESERO
                ) {
                  if (
                    notification.targetUsername?.toLowerCase() !==
                    username.toLowerCase()
                  ) {
                    return;
                  }
                } else if (
                  notification.targetUsername &&
                  notification.targetUsername.toLowerCase() !==
                    username.toLowerCase()
                ) {
                  return;
                }

                subscriber.next({
                  data: notification,
                });
              })
              .catch(() => {
                subscriber.complete();
              });
          },
          error: (err) => subscriber.error(err),
          complete: () => subscriber.complete(),
        });

      return () => {
        subscription.unsubscribe();
      };
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async getRecentNotifications(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.getRecentForRole(
      user.role.toUpperCase() as UserRole,
      user.username,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async deleteNotification(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.notificationsService.deleteNotificationForUser(
      id,
      user.role.toUpperCase() as UserRole,
      user.username,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/read')
  async markAsRead(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.notificationsService.markAsReadForUser(
      id,
      user.role.toUpperCase() as UserRole,
      user.username,
    );
  }
}
