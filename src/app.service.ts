import {
  Injectable,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

const DEFAULT_DB_HEALTH_TIMEOUT_MS = 2_000;

@Injectable()
export class AppService {
  constructor(@Optional() private readonly prisma?: PrismaService) {}

  getHello(): string {
    return 'Hello World!';
  }

  async getReadiness(timeoutMs = DEFAULT_DB_HEALTH_TIMEOUT_MS): Promise<{
    status: 'ok';
    database: 'up';
    timestamp: string;
  }> {
    const timestamp = new Date().toISOString();
    if (!this.prisma || typeof this.prisma.$queryRaw !== 'function') {
      return { status: 'ok', database: 'up', timestamp };
    }

    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.prisma.$queryRaw`SELECT 1`,
        new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(
            () => reject(new Error('Database readiness check timed out')),
            timeoutMs,
          );
        }),
      ]);
      return { status: 'ok', database: 'up', timestamp };
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        database: 'down',
        timestamp,
        message: 'La base de datos PostgreSQL no responde.',
      });
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }
}
