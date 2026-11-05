import { Injectable, Logger, Optional, type OnModuleDestroy } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
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

function defaultSpoolFilePath(): string {
  const configured = process.env.AUDIT_SPOOL_FILE_PATH?.trim();
  if (configured) {
    return configured;
  }
  return path.join(
    process.cwd(),
    'storage',
    'audit-spool',
    'pending-audit.jsonl',
  );
}

@Injectable()
export class AuditWriteQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(AuditWriteQueueService.name);
  private readonly entries: AutomaticAuditParams[] = [];
  private readonly maxQueueSize: number;
  private readonly spoolFilePath: string;
  private drainPromise?: Promise<void>;
  private accepting = true;
  private hasSpooledEntries = false;
  private isReplayingSpool = false;

  constructor(
    private readonly systemLogs: SystemLogsService,
    @Optional() options?: { maxQueueSize?: number; spoolFilePath?: string },
  ) {
    this.maxQueueSize =
      options?.maxQueueSize && options.maxQueueSize > 0
        ? options.maxQueueSize
        : queueLimit();
    this.spoolFilePath = options?.spoolFilePath ?? defaultSpoolFilePath();
    this.hasSpooledEntries = this.checkSpoolFileHasData();
  }

  enqueue(entry: AutomaticAuditParams): boolean {
    if (!this.accepting) {
      this.logger.warn(
        `Auditoría rechazada durante el cierre; respaldando en spool: ${entry.requestId}`,
      );
      this.appendToSpool([entry]);
      return false;
    }
    if (this.entries.length >= this.maxQueueSize) {
      this.logger.error(
        `Cola de auditoría llena (${this.maxQueueSize}); respaldando en disco ${entry.requestId}`,
      );
      this.appendToSpool([entry]);
      this.scheduleDrain();
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
    if (this.hasSpooledEntries) {
      await this.replaySpool();
    }
  }

  getSpooledEntriesCount(): number {
    return this.readSpooledEntries().length;
  }

  async replaySpool(): Promise<number> {
    if (this.isReplayingSpool || !this.hasSpooledEntries) {
      return 0;
    }
    this.isReplayingSpool = true;
    let recovered = 0;

    try {
      const spooled = this.readSpooledEntries();
      if (spooled.length === 0) {
        this.clearSpoolFile();
        return 0;
      }

      for (let index = 0; index < spooled.length; index += BATCH_SIZE) {
        const batch = spooled.slice(index, index + BATCH_SIZE);
        try {
          await this.systemLogs.createAutomaticBatch(batch);
          recovered += batch.length;
        } catch (error: unknown) {
          const remaining = spooled.slice(index);
          this.rewriteSpoolFile(remaining);
          this.logger.warn(
            `Reintento de spool de auditoría pospuesto (${remaining.length} pendientes): ${error instanceof Error ? error.message : String(error)}`,
          );
          return recovered;
        }
      }

      this.clearSpoolFile();
      return recovered;
    } finally {
      this.isReplayingSpool = false;
    }
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
      const persisted = await this.persistWithRetry(batch);
      if (persisted && this.hasSpooledEntries && this.entries.length === 0) {
        await this.replaySpool();
      }
    }
  }

  private async persistWithRetry(
    batch: AutomaticAuditParams[],
  ): Promise<boolean> {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        await this.systemLogs.createAutomaticBatch(batch);
        return true;
      } catch (error: unknown) {
        if (attempt === MAX_ATTEMPTS) {
          this.logger.error(
            `No se pudo guardar un lote de ${batch.length} auditorías después de ${MAX_ATTEMPTS} intentos; respaldando en spool de disco: ${error instanceof Error ? error.message : String(error)}`,
          );
          this.appendToSpool(batch);
          return false;
        }
        await new Promise<void>((resolve) =>
          setTimeout(resolve, 25 * 2 ** (attempt - 1)),
        );
      }
    }
    return false;
  }

  private checkSpoolFileHasData(): boolean {
    try {
      if (!fs.existsSync(this.spoolFilePath)) return false;
      return fs.statSync(this.spoolFilePath).size > 0;
    } catch {
      return false;
    }
  }

  private ensureSpoolDir(): void {
    const dir = path.dirname(this.spoolFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private appendToSpool(batch: readonly AutomaticAuditParams[]): void {
    if (batch.length === 0) return;
    try {
      this.ensureSpoolDir();
      const payload =
        batch.map((item) => JSON.stringify(item)).join('\n') + '\n';
      fs.appendFileSync(this.spoolFilePath, payload, 'utf8');
      this.hasSpooledEntries = true;
    } catch (error: unknown) {
      this.logger.error(
        `Fallo crítico al respaldar lote de auditoría en disco (${this.spoolFilePath}): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private readSpooledEntries(): AutomaticAuditParams[] {
    try {
      if (!fs.existsSync(this.spoolFilePath)) return [];
      const content = fs.readFileSync(this.spoolFilePath, 'utf8');
      const lines = content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      const parsed: AutomaticAuditParams[] = [];
      for (const line of lines) {
        try {
          parsed.push(JSON.parse(line) as AutomaticAuditParams);
        } catch {
          // Ignore malformed line
        }
      }
      return parsed;
    } catch {
      return [];
    }
  }

  private rewriteSpoolFile(entries: readonly AutomaticAuditParams[]): void {
    if (entries.length === 0) {
      this.clearSpoolFile();
      return;
    }
    try {
      this.ensureSpoolDir();
      const payload =
        entries.map((item) => JSON.stringify(item)).join('\n') + '\n';
      fs.writeFileSync(this.spoolFilePath, payload, 'utf8');
      this.hasSpooledEntries = true;
    } catch (error: unknown) {
      this.logger.error(
        `No se pudo actualizar archivo spool de auditoría: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private clearSpoolFile(): void {
    try {
      if (fs.existsSync(this.spoolFilePath)) {
        fs.unlinkSync(this.spoolFilePath);
      }
      this.hasSpooledEntries = false;
    } catch {
      this.hasSpooledEntries = false;
    }
  }
}
