import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UsersService } from '../services/users.service';
import { AuthLoginDto } from '../dto/auth-login.dto';
import { AuthPinLoginDto } from '../dto/auth-pin-login.dto';
import { AuthForgotPasswordDto } from '../dto/auth-forgot-password.dto';
import { AuthResetPasswordDto } from '../dto/auth-reset-password.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRoleDto } from '../dto/user-role.dto';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import type { Request } from 'express';

function requestSource(request: Request): string {
  return request.ip || request.socket.remoteAddress || 'unknown';
}

function extractRefreshTokenFromRequest(
  request?: Request,
  body?: { refreshToken?: string; refresh_token?: string },
): string | undefined {
  const fromBody = body?.refreshToken ?? body?.refresh_token;
  if (typeof fromBody === 'string' && fromBody.trim()) {
    return fromBody.trim();
  }
  const authHeader = request?.headers?.authorization;
  if (typeof authHeader === 'string' && /^Bearer\s+/i.test(authHeader)) {
    const bearer = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (bearer) return bearer;
  }
  return undefined;
}

const AUTHENTICATED_ROLES = [
  UserRoleDto.admin,
  UserRoleDto.cajero,
  UserRoleDto.cajero_principal,
  UserRoleDto.mesero,
  UserRoleDto.cocinero,
  UserRoleDto.motorizado,
  UserRoleDto.despachador,
];

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly users: UsersService) {}

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Public()
  @Post('login')
  login(@Body() dto: AuthLoginDto, @Req() request: Request) {
    return this.users.loginWithPassword({
      identifier: dto.identifier,
      password: dto.password,
      source: requestSource(request),
    });
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Public()
  @Post('pin')
  loginWithPin(@Body() dto: AuthPinLoginDto, @Req() request: Request) {
    return this.users.loginWithPin(dto.pin, requestSource(request));
  }

  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Public()
  @Post('forgot-password')
  async forgotPassword(
    @Body() dto: AuthForgotPasswordDto,
    @Req() request: Request,
  ) {
    return this.users.requestPasswordReset(dto.email, requestSource(request));
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('reset-password')
  async resetPassword(@Body() dto: AuthResetPasswordDto) {
    return this.users.resetPassword(dto.token, dto.newPassword);
  }

  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Public()
  @Post('refresh')
  async refresh(
    @CurrentUser() user?: AuthenticatedUser,
    @Req() request?: Request,
    @Body() body?: { refreshToken?: string; refresh_token?: string },
  ) {
    if (user?.id && !request && !body) {
      return this.users.refreshToken(user.id);
    }

    const rawToken = extractRefreshTokenFromRequest(request, body);
    if (rawToken && typeof this.users.refreshSessionToken === 'function') {
      return this.users.refreshSessionToken(rawToken);
    }

    if (user?.id) {
      return this.users.refreshToken(user.id);
    }

    return this.users.refreshSessionToken(rawToken);
  }

  @Roles(...AUTHENTICATED_ROLES)
  @Post('logout')
  async logout(@CurrentUser() user: AuthenticatedUser) {
    await this.users.revokeAllTokens(user.id);
    return { success: true, message: 'Sesión cerrada correctamente.' };
  }

  @Roles(...AUTHENTICATED_ROLES)
  @Post('logout-all')
  async logoutAll(@CurrentUser() user: AuthenticatedUser) {
    await this.users.revokeAllTokens(user.id);
    return { success: true, message: 'Sesiones revocadas exitosamente.' };
  }
}
