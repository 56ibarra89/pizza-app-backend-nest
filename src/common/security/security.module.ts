import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PinAttemptService } from './pin-attempt.service';
import { PinHasherService } from './pin-hasher.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Global()
@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [PinHasherService, PinAttemptService],
  exports: [PinHasherService, PinAttemptService],
})
export class SecurityModule {}
