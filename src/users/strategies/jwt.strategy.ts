import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { fromDbRole } from '../mappers/user-role.mapper';
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
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Usuario inactivo o no existe');
    }
    if (user.tokenVersion !== payload.tokenVersion) {
      throw new UnauthorizedException(
        'La sesión ha expirado en este dispositivo.',
      );
    }

    return {
      id: user.id,
      username: user.username,
      role: fromDbRole(user.role),
    };
  }
}
