import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import {
  SystemLogsService,
  type AutomaticAuditParams,
} from '../services/system-logs.service';

const DEFAULT_MAX_QUEUE_SIZE = 2_000;
const BATCH_SIZE = 100;
const MAX_ATTEMPTS = 3;

function queueLimit(): number {
  const configured = Number.parseInt(
    process.env.AUDIT_QUEUE_MAX_SIZE ?? '',
    10,
  );
  return Number.isInteger(configured) && configured > 0
    ? configured
    : DEFAULT_MAX_QUEUE_SIZE;
}

@Injectable()
export class AuditWriteQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(AuditWriteQueueService.name);
  private readonly entries: AutomaticAuditParams[] = [];
  private readonly maxQueueSize = queueLimit();
  private drainPromise?: Promise<void>;
  private accepting = true;

  constructor(private readonly systemLogs: SystemLogsService) {}

  enqueue(entry: AutomaticAuditParams): boolean {
    if (!this.accepting) {
      this.logger.warn(
        `Auditoría rechazada durante el cierre: ${entry.requestId}`,
      );
      return false;
    }
    if (this.entries.length >= this.maxQueueSize) {
      this.logger.error(
        `Cola de auditoría llena (${this.maxQueueSize}); no se pudo encolar ${entry.requestId}`,
      );
      return false;
    }

    this.entries.push(entry);
    this.scheduleDrain();
    return true;
  }

  async onModuleDestroy(): Promise<void> {
    this.accepting = false;
    await this.flush();
  }

  async flush(): Promise<void> {
    while (this.drainPromise) await this.drainPromise;
    if (this.entries.length > 0) await this.drain();
  }

  private scheduleDrain(): void {
    if (this.drainPromise) return;
    this.drainPromise = new Promise<void>((resolve) => setImmediate(resolve))
      .then(() => this.drain())
      .finally(() => {
        this.drainPromise = undefined;
        if (this.entries.length > 0) this.scheduleDrain();
      });
  }

  private async drain(): Promise<void> {
    while (this.entries.length > 0) {
      const batch = this.entries.splice(0, BATCH_SIZE);
      await this.persistWithRetry(batch);
    }
  }

  private async persistWithRetry(batch: AutomaticAuditParams[]): Promise<void> {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        await this.systemLogs.createAutomaticBatch(batch);
        return;
      } catch (error: unknown) {
        if (attempt === MAX_ATTEMPTS) {
          this.logger.error(
            `No se pudo guardar un lote de ${batch.length} auditorías después de ${MAX_ATTEMPTS} intentos: ${error instanceof Error ? error.message : String(error)}`,
          );
          return;
        }
        await new Promise<void>((resolve) =>
          setTimeout(resolve, 25 * 2 ** (attempt - 1)),
        );
      }
    }
  }
}
