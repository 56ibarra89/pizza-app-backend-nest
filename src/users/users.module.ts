import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { USERS_REPOSITORY } from './interfaces/users.repository';
import { PrismaUsersRepository } from './repositories/prisma-users.repository';
import { PasswordHasherService } from './services/password-hasher.service';
import { UsersService } from './services/users.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { UsersController } from './controllers/users.controller';
import { AuthController } from './controllers/auth.controller';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'pizza-secret-key',
      signOptions: { expiresIn: '1h' },
    }),
  ],
  controllers: [UsersController, AuthController],
  providers: [
    PasswordHasherService,
    UsersService,
    JwtStrategy,
    {
      provide: USERS_REPOSITORY,
      useClass: PrismaUsersRepository,
    },
  ],
})
export class UsersModule {}
