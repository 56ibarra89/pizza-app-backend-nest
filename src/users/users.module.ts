import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { USERS_REPOSITORY } from './interfaces/users.repository';
import { PrismaUsersRepository } from './repositories/prisma-users.repository';
import { PasswordHasherService } from './services/password-hasher.service';
import { UsersService } from './services/users.service';
import { UserLockoutService } from './services/user-lockout.service';
import { PasswordResetEmailService } from './services/password-reset-email.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { UsersController } from './controllers/users.controller';
import { AuthController } from './controllers/auth.controller';
import { ShiftsModule } from '../shifts/shifts.module';

@Module({
  imports: [
    ShiftsModule,
    JwtModule.register({
      secret:
        process.env.JWT_SECRET ||
        (process.env.NODE_ENV === 'production'
          ? (() => {
              throw new Error('JWT_SECRET must be defined in production!');
            })()
          : 'pizza-secret-key-dev-only-change-me'),
      signOptions: { expiresIn: '1h' },
    }),
  ],
  controllers: [UsersController, AuthController],
  providers: [
    PasswordHasherService,
    UserLockoutService,
    PasswordResetEmailService,
    UsersService,
    JwtStrategy,
    {
      provide: USERS_REPOSITORY,
      useClass: PrismaUsersRepository,
    },
  ],
  exports: [JwtModule, USERS_REPOSITORY],
})
export class UsersModule {}
