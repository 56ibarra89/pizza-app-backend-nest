import { Module } from '@nestjs/common';
import { USERS_REPOSITORY } from './interfaces/users.repository';
import { PrismaUsersRepository } from './repositories/prisma-users.repository';
import { PasswordHasherService } from './services/password-hasher.service';
import { UsersService } from './services/users.service';
import { UsersController } from './controllers/users.controller';
import { AuthController } from './controllers/auth.controller';

@Module({
  controllers: [UsersController, AuthController],
  providers: [
    PasswordHasherService,
    UsersService,
    {
      provide: USERS_REPOSITORY,
      useClass: PrismaUsersRepository,
    },
  ],
})
export class UsersModule {}
