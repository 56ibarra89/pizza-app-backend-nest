import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of, throwError } from 'rxjs';
import { AutomaticAuditInterceptor } from './automatic-audit.interceptor';
import type { AuditSnapshotService } from './audit-snapshot.service';
import type { AuditWriteQueueService } from './audit-write-queue.service';

function createContext(overrides: Record<string, unknown> = {}) {
  const request = {
    method: 'PATCH',
    originalUrl: '/products/product-id',
    headers: { 'x-audit-source': 'interface' },
    params: { id: 'product-id' },
    body: { name: 'Pizza', password: 'no-debe-guardarse' },
    ip: '127.0.0.1',
    socket: {},
    user: { id: 'user-id', username: 'admin', role: 'admin' },
    get: jest.fn().mockReturnValue('jest-agent'),
    ...overrides,
  };
  const response = { statusCode: 200, setHeader: jest.fn() };
  const context = {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
  return { context, request, response };
}

describe('AutomaticAuditInterceptor', () => {
  const enqueue = jest.fn().mockReturnValue(true);
  const queue = { enqueue } as unknown as AuditWriteQueueService;
  const capture = jest.fn().mockResolvedValue({
    entity: 'product',
    entityId: 'product-id',
    before: { id: 'product-id', name: 'Pizza anterior' },
  });
  const snapshots = { capture } as unknown as AuditSnapshotService;
  const interceptor = new AutomaticAuditInterceptor(queue, snapshots);

  beforeEach(() => jest.clearAllMocks());

  it('registra automáticamente una modificación autenticada y protege secretos', async () => {
    const { context, response } = createContext();
    const next = {
      handle: () => of({ id: 'product-id', name: 'Pizza' }),
    } as CallHandler;

    const result = await lastValueFrom(interceptor.intercept(context, next));

    expect(result).toEqual({ id: 'product-id', name: 'Pizza' });
    expect(response.setHeader).toHaveBeenCalledWith(
      'X-Request-Id',
      expect.any(String),
    );
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PRODUCTS_UPDATE',
        module: 'products',
        operation: 'UPDATE',
        entityId: 'product-id',
        source: 'INTERFACE',
        success: true,
        before: { id: 'product-id', name: 'Pizza anterior' },
        user: { id: 'user-id', username: 'admin', role: 'admin' },
        metadata: {
          requestedChanges: { name: 'Pizza', password: '[PROTEGIDO]' },
        },
      }),
    );
  });

  it('registra el intento fallido sin ocultar el error original', async () => {
    const { context } = createContext({
      method: 'DELETE',
      originalUrl: '/products/product-id',
    });
    const originalError = new Error('falló la operación');
    const next = {
      handle: () => throwError(() => originalError),
    } as CallHandler;

    await expect(
      lastValueFrom(interceptor.intercept(context, next)),
    ).rejects.toBe(originalError);
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PRODUCTS_DELETE',
        operation: 'DELETE',
        success: false,
      }),
    );
  });

  it('no duplica el endpoint que escribe eventos manuales', async () => {
    const { context } = createContext({
      method: 'POST',
      originalUrl: '/system-logs',
    });
    const next = { handle: () => of({ id: 10 }) } as CallHandler;

    await lastValueFrom(interceptor.intercept(context, next));

    expect(enqueue).not.toHaveBeenCalled();
  });
});
