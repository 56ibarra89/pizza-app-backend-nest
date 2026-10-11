import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { UserRoleDto } from '../enums/user-role.enum';
import type { AuthenticatedUser } from '../interfaces/authenticated-user.interface';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    const requiredRoles = this.reflector.getAllAndOverride<UserRoleDto[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();

    if (
      (!requiredRoles || requiredRoles.length === 0) &&
      (!requiredPermissions || requiredPermissions.length === 0)
    ) {
      return true;
    }

    if (!user || !user.role) {
      throw new ForbiddenException(
        'No tienes permisos suficientes (rol no encontrado)',
      );
    }

    if (requiredPermissions?.length) {
      const available = new Set(user.permissions || []);
      const missing = requiredPermissions.filter(
        (code) => !available.has(code),
      );
      if (missing.length > 0) {
        throw new ForbiddenException(
          `No tienes permisos suficientes. Permisos requeridos: ${missing.join(', ')}`,
        );
      }
      return true;
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
