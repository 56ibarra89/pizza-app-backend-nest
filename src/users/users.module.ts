import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { USERS_REPOSITORY } from './interfaces/users.repository';
import { PrismaUsersRepository } from './repositories/prisma-users.repository';
import { PasswordHasherService } from './services/password-hasher.service';
import { UsersService } from './services/users.service';
import { UserLockoutService } from './services/user-lockout.service';
import { PasswordResetEmailService } from './services/password-reset-email.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { UsersController } from './controllers/users.controller';
import { AuthController } from './controllers/auth.controller';
import {
  getJwtAudience,
  getJwtIssuer,
  requireSecuritySecret,
} from '../common/security/security-config';

@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: requireSecuritySecret(config, 'JWT_SECRET'),
        signOptions: {
          expiresIn: (config.get<string>('JWT_EXPIRES_IN') || '15m') as any,
          algorithm: 'HS256',
          issuer: getJwtIssuer(config),
          audience: getJwtAudience(config),
        },
        verifyOptions: {
          algorithms: ['HS256'],
          issuer: getJwtIssuer(config),
          audience: getJwtAudience(config),
        },
      }),
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
  exports: [JwtModule, USERS_REPOSITORY, UsersService],
})
export class UsersModule {}
