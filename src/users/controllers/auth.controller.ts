import { Body, Controller, Post, Request } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UsersService } from '../services/users.service';
import { AuthLoginDto } from '../dto/auth-login.dto';
import { AuthPinLoginDto } from '../dto/auth-pin-login.dto';
import { AuthForgotPasswordDto } from '../dto/auth-forgot-password.dto';
import { AuthResetPasswordDto } from '../dto/auth-reset-password.dto';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly users: UsersService) {}

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

  @Post('logout-all')
  async logoutAll(@Request() req: any) {
    // req.user is populated by JwtStrategy
    const userId = req.user.id;
    await this.users.revokeAllTokens(userId);
    return { success: true, message: 'Sesiones revocadas exitosamente.' };
  }
}
