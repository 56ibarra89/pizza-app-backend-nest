import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UsersService } from '../services/users.service';
import { AuthLoginDto } from '../dto/auth-login.dto';
import { AuthPinLoginDto } from '../dto/auth-pin-login.dto';
import { AuthForgotPasswordDto } from '../dto/auth-forgot-password.dto';
import { AuthResetPasswordDto } from '../dto/auth-reset-password.dto';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('auth')
@Public()
@Controller('auth')
export class AuthController {
  constructor(private readonly users: UsersService) {}

  @Post('login')
  login(@Body() dto: AuthLoginDto) {
    return this.users.loginWithPassword({
      identifier: dto.identifier,
      password: dto.password,
    });
  }

  @Post('pin')
  loginWithPin(@Body() dto: AuthPinLoginDto) {
    return this.users.loginWithPin(dto.pin);
  }

  @Post('forgot-password')
  async forgotPassword(@Body() dto: AuthForgotPasswordDto) {
    return this.users.requestPasswordReset(dto.email);
  }

  @Post('reset-password')
  async resetPassword(@Body() dto: AuthResetPasswordDto) {
    return this.users.resetPassword(dto.token, dto.newPassword);
  }
}
