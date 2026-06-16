import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { fromDbRole } from '../mappers/user-role.mapper';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        ExtractJwt.fromUrlQueryParameter('token'),
      ]),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' 
        ? (() => { throw new Error('JWT_SECRET must be defined in production!'); })() 
        : 'pizza-secret-key-dev-only-change-me'),
    });
  }

  async validate(payload: any) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Usuario inactivo o no existe');
    }
    if (user.tokenVersion !== payload.tokenVersion) {
      throw new UnauthorizedException('La sesión ha expirado en este dispositivo.');
    }
    // Este objeto se inyectará en req.user
    return { id: user.id, username: user.username, role: fromDbRole(user.role) };
  }
}
