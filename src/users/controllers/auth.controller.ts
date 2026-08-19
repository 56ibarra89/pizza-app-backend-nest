import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
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
import { ShiftsService } from '../../shifts/services/shifts.service';

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
  constructor(
    private readonly users: UsersService,
    private readonly shifts: ShiftsService,
  ) {}

  @Public()
  @Post('login')
  login(@Body() dto: AuthLoginDto) {
    return this.users.loginWithPassword({
      identifier: dto.identifier,
      password: dto.password,
    });
  }

  @Public()
  @Post('pin')
  loginWithPin(@Body() dto: AuthPinLoginDto) {
    return this.users.loginWithPin(dto.pin);
  }

  @Public()
  @Post('forgot-password')
  async forgotPassword(@Body() dto: AuthForgotPasswordDto) {
    return this.users.requestPasswordReset(dto.email);
  }

  @Public()
  @Post('reset-password')
  async resetPassword(@Body() dto: AuthResetPasswordDto) {
    return this.users.resetPassword(dto.token, dto.newPassword);
  }

  @Roles(...AUTHENTICATED_ROLES)
  @Post('logout')
  async logout(@CurrentUser() user: AuthenticatedUser) {
    await this.shifts.assertCanTerminateSession(user);
    return { success: true, message: 'Sesión cerrada correctamente.' };
  }

  @Roles(...AUTHENTICATED_ROLES)
  @Post('logout-all')
  async logoutAll(@CurrentUser() user: AuthenticatedUser) {
    await this.shifts.assertCanTerminateSession(user);
    await this.users.revokeAllTokens(user.id);
    return { success: true, message: 'Sesiones revocadas exitosamente.' };
  }
}
