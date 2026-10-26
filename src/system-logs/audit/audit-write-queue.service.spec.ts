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
  it('agrupa escrituras y no bloquea a quien encola la auditoría', async () => {
    let release!: () => void;
    const pendingWrite = new Promise<number>((resolve) => {
      release = () => resolve(2);
    });
    const createAutomaticBatch = jest.fn().mockReturnValue(pendingWrite);
    const service = { createAutomaticBatch } as unknown as SystemLogsService;
    const queue = new AuditWriteQueueService(service);

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
    const queue = new AuditWriteQueueService(service);

    queue.enqueue(entry('request-retry'));
    await queue.flush();

    expect(createAutomaticBatch).toHaveBeenCalledTimes(2);
  });

  it('deja de aceptar eventos después de iniciar el cierre', async () => {
    const createAutomaticBatch = jest.fn().mockResolvedValue(1);
    const service = { createAutomaticBatch } as unknown as SystemLogsService;
    const queue = new AuditWriteQueueService(service);

    await queue.onModuleDestroy();

    expect(queue.enqueue(entry('request-after-shutdown'))).toBe(false);
    expect(createAutomaticBatch).not.toHaveBeenCalled();
  });
});
