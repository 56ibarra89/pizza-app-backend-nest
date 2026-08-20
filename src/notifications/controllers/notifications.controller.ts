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
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRoleDto } from '../../users/dto/user-role.dto';
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
    const role = user.role.toUpperCase() as UserRole;
    return this.notificationsService.notificationStream.asObservable().pipe(
      filter((notification) => {
        if (notification.role !== role) {
          return false;
        }

        if (
          role === UserRole.MOTORIZADO ||
          role === UserRole.CAJERO ||
          role === UserRole.MESERO
        ) {
          return (
            notification.targetUsername?.toLowerCase() ===
            user.username.toLowerCase()
          );
        }

        return (
          !notification.targetUsername ||
          notification.targetUsername.toLowerCase() ===
            user.username.toLowerCase()
        );
      }),
      map((notification) => ({
        data: notification,
      })),
    );
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

