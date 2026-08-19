import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UserRoleDto } from '../../users/dto/user-role.dto';
import type { AuthenticatedUser } from '../interfaces/authenticated-user.interface';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRoleDto[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    if (!user || !user.role) {
      throw new ForbiddenException(
        'No tienes permisos suficientes (rol no encontrado)',
      );
    }

    const userRole = user.role.toLowerCase();
    const hasRole = requiredRoles.some((r) => r.toLowerCase() === userRole);
    if (!hasRole) {
      throw new ForbiddenException(
        `No tienes permisos suficientes. Roles permitidos: ${requiredRoles.join(', ')}`,
      );
    }

    return true;
  }
}
