import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const MAX_FAILURES = 5;
const LOCK_DURATIONS_MS = [30_000, 60_000, 120_000, 300_000] as const;
const PIN_LOCK_DURATIONS_SECONDS = [2, 5, 15, 30, 60] as const;

export interface AuthenticationLockout {
  retryAfterSeconds: number;
}

@Injectable()
export class PinAttemptService {
  private readonly logger = new Logger(PinAttemptService.name);

  constructor(private readonly prisma: PrismaService) {}

  async assertAllowed(scopes: string | string[]): Promise<void> {
    const keys = this.normalizeScopes(scopes);
    const blocked = await this.prisma.authAttempt.findFirst({
      where: {
        key: { in: keys },
        lockedUntil: { gt: new Date() },
      },
      select: { key: true, lockedUntil: true },
    });
    if (blocked) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil(
          ((blocked.lockedUntil?.getTime() ?? Date.now()) - Date.now()) / 1000,
        ),
      );
      this.logger.warn(
        `Authentication scope temporarily blocked: ${blocked.key}`,
      );
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message:
            'Demasiados intentos de acceso. Intenta nuevamente más tarde.',
          retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async registerFailure(scopes: string | string[]): Promise<void> {
    const keys = this.normalizeScopes(scopes);
    await this.prisma.$transaction(
      keys.map(
        (key) =>
          this.prisma.$executeRaw`
          INSERT INTO "AuthAttempt" ("key", "failures", "level", "lockedUntil", "updatedAt")
          VALUES (${key}, 1, 0, NULL, (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'))
          ON CONFLICT ("key") DO UPDATE SET
            "failures" = CASE
              WHEN "AuthAttempt"."failures" + 1 >= ${MAX_FAILURES} THEN 0
              ELSE "AuthAttempt"."failures" + 1
            END,
            "level" = CASE
              WHEN "AuthAttempt"."failures" + 1 >= ${MAX_FAILURES}
                THEN LEAST("AuthAttempt"."level" + 1, ${LOCK_DURATIONS_MS.length - 1})
              ELSE "AuthAttempt"."level"
            END,
            "lockedUntil" = CASE
              WHEN "AuthAttempt"."failures" + 1 >= ${MAX_FAILURES} THEN
                (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + (
                  CASE LEAST("AuthAttempt"."level", ${LOCK_DURATIONS_MS.length - 1})
                    WHEN 0 THEN INTERVAL '30 seconds'
                    WHEN 1 THEN INTERVAL '60 seconds'
                    WHEN 2 THEN INTERVAL '120 seconds'
                    ELSE INTERVAL '300 seconds'
                  END
                )
              ELSE "AuthAttempt"."lockedUntil"
            END,
            "updatedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
        `,
      ),
    );
  }

  async registerPinFailure(
    scopes: string | string[],
  ): Promise<AuthenticationLockout> {
    const keys = this.normalizeScopes(scopes);
    await this.prisma.$transaction(
      keys.map(
        (key) =>
          this.prisma.$executeRaw`
          INSERT INTO "AuthAttempt" ("key", "failures", "level", "lockedUntil", "updatedAt")
          VALUES (
            ${key},
            1,
            0,
            (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '2 seconds',
            (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
          )
          ON CONFLICT ("key") DO UPDATE SET
            "failures" = "AuthAttempt"."failures" + 1,
            "level" = LEAST("AuthAttempt"."level" + 1, ${PIN_LOCK_DURATIONS_SECONDS.length - 1}),
            "lockedUntil" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + (
              CASE LEAST("AuthAttempt"."level" + 1, ${PIN_LOCK_DURATIONS_SECONDS.length - 1})
                WHEN 1 THEN INTERVAL '5 seconds'
                WHEN 2 THEN INTERVAL '15 seconds'
                WHEN 3 THEN INTERVAL '30 seconds'
                ELSE INTERVAL '60 seconds'
              END
            ),
            "updatedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
        `,
      ),
    );

    const states = await this.prisma.authAttempt.findMany({
      where: { key: { in: keys } },
      select: { lockedUntil: true },
    });
    const now = Date.now();
    return {
      retryAfterSeconds: Math.max(
        1,
        ...states.map((state) =>
          Math.ceil(((state.lockedUntil?.getTime() ?? now) - now) / 1000),
        ),
      ),
    };
  }

  async registerSuccess(scopes: string | string[]): Promise<void> {
    await this.prisma.authAttempt.deleteMany({
      where: { key: { in: this.normalizeScopes(scopes) } },
    });
  }

  private normalizeScopes(scopes: string | string[]): string[] {
    return [...new Set(Array.isArray(scopes) ? scopes : [scopes])]
      .map((scope) => scope.trim())
      .filter(Boolean)
      .map((scope) => scope.slice(0, 250));
  }
}
