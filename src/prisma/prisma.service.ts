import {
  type BeforeApplicationShutdown,
  Injectable,
  type OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, BeforeApplicationShutdown
{
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async beforeApplicationShutdown(): Promise<void> {
    await this.$disconnect();
  }
}
