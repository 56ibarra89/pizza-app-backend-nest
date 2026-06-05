import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UserRoleDto } from '../../users/dto/user-role.dto';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRoleDto[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true; // No explicit roles required, so it relies on JwtAuthGuard
    }

    const { user } = context.switchToHttp().getRequest();

    if (!user || !user.role) {
      throw new ForbiddenException('No tienes permisos suficientes (rol no encontrado)');
    }

    const userRole = typeof user.role === 'string' ? user.role.toLowerCase() : user.role;
    const hasRole = requiredRoles.some(r => r.toLowerCase() === userRole);
    if (!hasRole) {
      throw new ForbiddenException(`No tienes permisos suficientes. Roles permitidos: ${requiredRoles.join(', ')}`);
    }

    return true;
  }
}
