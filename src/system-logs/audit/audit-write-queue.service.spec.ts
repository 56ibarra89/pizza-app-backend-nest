import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { SystemLogsService } from '../services/system-logs.service';
import { UserRoleDto } from '../../common/enums/user-role.enum';
import { AuditWriteQueueService } from './audit-write-queue.service';

const entry = (requestId: string) => ({
  user: { id: 'user-id', username: 'admin', role: UserRoleDto.admin },
  action: 'PRODUCTS_UPDATE',
  module: 'products',
  operation: 'UPDATE',
  entity: 'product',
  entityId: 'product-id',
  source: 'API',
  requestId,
  httpMethod: 'PATCH',
  route: '/products/product-id',
  statusCode: 200,
  success: true,
  durationMs: 10,
});

describe('AuditWriteQueueService', () => {
  let tempDir: string;
  let spoolFilePath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-spool-test-'));
    spoolFilePath = path.join(tempDir, 'pending-audit.jsonl');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('conserva el archivo original si falla el reemplazo', async () => {
    const original = JSON.stringify(entry('old')) + '\n';
    fs.writeFileSync(spoolFilePath, original);
    const queue = new AuditWriteQueueService({ createAutomaticBatch: jest.fn().mockResolvedValue(1) } as unknown as SystemLogsService, { spoolFilePath });
    const rename = jest.spyOn(jest.requireActual<typeof import('fs')>('fs'), 'renameSync').mockImplementation(() => { throw new Error('disk error'); });
    try {
      await queue.replaySpool();
      expect(fs.readFileSync(spoolFilePath, 'utf8')).toBe(original);
    } finally { rename.mockRestore(); }
  });

  it('conserva el spool completo cuando contiene una línea inválida', async () => {
    const original = JSON.stringify(entry('old')) + '\n{invalido\n';
    fs.writeFileSync(spoolFilePath, original);
    const createAutomaticBatch = jest.fn();
    const queue = new AuditWriteQueueService({ createAutomaticBatch } as unknown as SystemLogsService, { spoolFilePath });
    await queue.replaySpool();
    expect(createAutomaticBatch).not.toHaveBeenCalled();
    expect(fs.readFileSync(spoolFilePath, 'utf8')).toBe(original);
  });

  it('conserva eventos agregados mientras recupera el spool', async () => {
    fs.writeFileSync(spoolFilePath, JSON.stringify(entry('old')) + '\n');
    let release!: () => void;
    const createAutomaticBatch = jest.fn().mockImplementation(() => new Promise<number>((resolve) => { release = () => resolve(1); }));
    const queue = new AuditWriteQueueService({ createAutomaticBatch } as unknown as SystemLogsService, { spoolFilePath });
    const replay = queue.replaySpool();
    fs.appendFileSync(spoolFilePath, JSON.stringify(entry('new')) + '\n');
    release();
    await replay;
    expect(fs.readFileSync(spoolFilePath, 'utf8')).toContain('new');
    expect(queue.getSpooledEntriesCount()).toBe(1);
  });

  it('agrupa escrituras y no bloquea a quien encola la auditoría', async () => {
    let release!: () => void;
    const pendingWrite = new Promise<number>((resolve) => {
      release = () => resolve(2);
    });
    const createAutomaticBatch = jest.fn().mockReturnValue(pendingWrite);
    const service = { createAutomaticBatch } as unknown as SystemLogsService;
    const queue = new AuditWriteQueueService(service, { spoolFilePath });

    expect(queue.enqueue(entry('request-1'))).toBe(true);
    expect(queue.enqueue(entry('request-2'))).toBe(true);
    expect(createAutomaticBatch).not.toHaveBeenCalled();

    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(createAutomaticBatch).toHaveBeenCalledTimes(1);
    expect(createAutomaticBatch).toHaveBeenCalledWith([
      entry('request-1'),
      entry('request-2'),
    ]);

    release();
    await queue.flush();
  });

  it('reintenta temporalmente un lote fallido', async () => {
    const createAutomaticBatch = jest
      .fn()
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValueOnce(1);
    const service = { createAutomaticBatch } as unknown as SystemLogsService;
    const queue = new AuditWriteQueueService(service, { spoolFilePath });

    queue.enqueue(entry('request-retry'));
    await queue.flush();

    expect(createAutomaticBatch).toHaveBeenCalledTimes(2);
  });

  it('deja de aceptar eventos en memoria después de iniciar el cierre y los respalda en spool', async () => {
    const createAutomaticBatch = jest.fn().mockResolvedValue(1);
    const service = { createAutomaticBatch } as unknown as SystemLogsService;
    const queue = new AuditWriteQueueService(service, { spoolFilePath });

    await queue.onModuleDestroy();

    expect(queue.enqueue(entry('request-after-shutdown'))).toBe(false);
    expect(createAutomaticBatch).not.toHaveBeenCalled();
    expect(queue.getSpooledEntriesCount()).toBe(1);
  });

  it('persiste en spool los lotes que agotan reintentos y los recupera cuando la base vuelve a estar disponible', async () => {
    const createAutomaticBatch = jest
      .fn()
      .mockRejectedValueOnce(new Error('db down 1'))
      .mockRejectedValueOnce(new Error('db down 2'))
      .mockRejectedValueOnce(new Error('db down 3'))
      .mockResolvedValue(1);
    const service = { createAutomaticBatch } as unknown as SystemLogsService;
    const queue = new AuditWriteQueueService(service, { spoolFilePath });

    queue.enqueue(entry('request-failed-batch'));
    await new Promise<void>((resolve) => setTimeout(resolve, 220));

    expect(queue.getSpooledEntriesCount()).toBe(1);

    const recovered = await queue.replaySpool();
    expect(recovered).toBe(1);
    expect(queue.getSpooledEntriesCount()).toBe(0);
  });

  it('respalda en spool cuando la cola en memoria alcanza su capacidad máxima', async () => {
    let release!: () => void;
    const pendingWrite = new Promise<number>((resolve) => {
      release = () => resolve(1);
    });
    const createAutomaticBatch = jest.fn().mockReturnValue(pendingWrite);
    const service = { createAutomaticBatch } as unknown as SystemLogsService;
    const queue = new AuditWriteQueueService(service, {
      maxQueueSize: 1,
      spoolFilePath,
    });

    expect(queue.enqueue(entry('request-1'))).toBe(true);
    expect(queue.enqueue(entry('request-overflow'))).toBe(false);
    expect(queue.getSpooledEntriesCount()).toBe(1);

    release();
    await queue.flush();
    expect(queue.getSpooledEntriesCount()).toBe(0);
  });
});
