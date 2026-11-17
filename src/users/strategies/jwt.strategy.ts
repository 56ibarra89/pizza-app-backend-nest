import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { fromDbRole } from '../mappers/user-role.mapper';
import { DEFAULT_ROLE_PERMISSIONS } from '../../access-control/permission-catalog';
import { ConfigService } from '@nestjs/config';
import {
  getJwtAudience,
  getJwtIssuer,
  requireSecuritySecret,
} from '../../common/security/security-config';

interface AccessJwtPayload {
  sub: string;
  tokenVersion: number;
  type: 'access';
  exp?: number;
}

function isAccessJwtPayload(payload: unknown): payload is AccessJwtPayload {
  if (typeof payload !== 'object' || payload === null) return false;
  const candidate = payload as Record<string, unknown>;
  return (
    candidate.type === 'access' &&
    typeof candidate.sub === 'string' &&
    Number.isInteger(candidate.tokenVersion)
  );
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private prisma: PrismaService,
    config: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: requireSecuritySecret(config, 'JWT_SECRET'),
      algorithms: ['HS256'],
      issuer: getJwtIssuer(config),
      audience: getJwtAudience(config),
    });
  }

  async validate(payload: unknown) {
    if (!isAccessJwtPayload(payload)) {
      throw new UnauthorizedException('Token no válido para acceder a la API');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        accessRole: {
          include: {
            permissions: { include: { permission: true } },
          },
        },
      },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Usuario inactivo o no existe');
    }
    if (user.tokenVersion !== payload.tokenVersion) {
      throw new UnauthorizedException(
        'La sesión ha expirado en este dispositivo.',
      );
    }
    if (user.accessRole && user.accessRole.isActive === false) {
      throw new UnauthorizedException(
        'El rol asignado al usuario se encuentra inactivo.',
      );
    }

    const mappedRole = fromDbRole(user.role);
    const permissions = user.accessRole
      ? user.accessRole.permissions.map((entry) => entry.permission.code)
      : [...(DEFAULT_ROLE_PERMISSIONS[mappedRole] ?? [])];

    return {
      id: user.id,
      username: user.username,
      role: mappedRole,
      accessRoleId: user.accessRole?.id,
      accessRoleName: user.accessRole?.name,
      permissions,
      tokenVersion: user.tokenVersion,
      tokenExpiresAtMs:
        typeof payload.exp === 'number' ? payload.exp * 1000 : undefined,
    };
  }
}
