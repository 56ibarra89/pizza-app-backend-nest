import { CorrelativoStatus, DocumentType } from '@prisma/client';
import { PrismaCorrelativosRepository } from './prisma-correlativos.repository';

describe('PrismaCorrelativosRepository — B25 concurrency lock & ordering', () => {
  it('detecta un número emitido con prefijo equivalente antes de activar otro rango', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-19T18:00:00Z') });
    try {
      const findMany = jest.fn().mockResolvedValue([{ invoiceNumber: 'NOV26-CAJA-001' }]);
      const create = jest.fn();
      const updateMany = jest.fn();
      const repo = new PrismaCorrelativosRepository({
        order: { findMany },
        correlativo: { create, updateMany },
      } as never);

      await expect(repo.create({
        documentType: DocumentType.FACTURA,
        resolutionNumber: 'RES-NUEVA',
        prefix: 'CAJA-',
        startNumber: 1,
        endNumber: 999,
        currentNumber: 1,
        issueDate: new Date('2026-11-01T06:00:00Z'),
        expirationDate: new Date('2026-12-01T05:59:59Z'),
        status: CorrelativoStatus.ACTIVO,
      })).rejects.toThrow('colisiona con una factura ya emitida');

      expect(findMany).toHaveBeenCalledWith({
        where: { invoiceNumber: { startsWith: 'NOV26-CAJA-', gte: 'NOV26-CAJA-001', lte: 'NOV26-CAJA-999' } },
        select: { invoiceNumber: true },
      });
      expect(updateMany).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('acquires transaction advisory lock before deactivating and creating an ACTIVO correlativo', async () => {
    const callOrder: string[] = [];
    const createdRow = {
      id: 'corr-new',
      documentType: DocumentType.FACTURA,
      resolutionNumber: 'RES-2026-01',
      prefix: 'NOV26-',
      startNumber: 1,
      endNumber: 1000,
      currentNumber: 1,
      issueDate: new Date('2026-11-01T06:00:00.000Z'),
      expirationDate: new Date('2026-12-01T05:59:59.999Z'),
      status: CorrelativoStatus.ACTIVO,
      createdAt: new Date('2026-11-01T06:00:00.000Z'),
    };
    const tx = {
      $executeRaw: jest.fn().mockImplementation(async () => {
        callOrder.push('lock');
        return 1;
      }),
      correlativo: {
        updateMany: jest.fn().mockImplementation(async () => {
          callOrder.push('updateMany');
          return { count: 1 };
        }),
        create: jest.fn().mockImplementation(async () => {
          callOrder.push('create');
          return createdRow;
        }),
      },
    };
    const prisma = {
      $transaction: jest
        .fn()
        .mockImplementation((cb: (client: unknown) => Promise<unknown>) =>
          cb(tx),
        ),
    };

    const repo = new PrismaCorrelativosRepository(prisma as never);
    const created = await repo.create({
      documentType: DocumentType.FACTURA,
      resolutionNumber: 'RES-2026-01',
      prefix: 'NOV26-',
      startNumber: 1,
      endNumber: 1000,
      currentNumber: 1,
      issueDate: createdRow.issueDate,
      expirationDate: createdRow.expirationDate,
      status: CorrelativoStatus.ACTIVO,
    });

    expect(created.id).toBe('corr-new');
    expect(callOrder).toEqual(['lock', 'updateMany', 'create']);
  });

  it('acquires advisory lock before locking and consuming next number inside consumeNext', async () => {
    const callOrder: string[] = [];
    const activeRow = {
      id: 'corr-1',
      documentType: DocumentType.FACTURA,
      resolutionNumber: 'RES-2026-01',
      prefix: 'NOV26-',
      startNumber: 1,
      endNumber: 100,
      currentNumber: 5,
      issueDate: new Date('2026-11-01T06:00:00.000Z'),
      expirationDate: new Date('2027-12-01T05:59:59.999Z'),
      status: CorrelativoStatus.ACTIVO,
      createdAt: new Date('2026-11-01T06:00:00.000Z'),
    };
    const tx = {
      $executeRaw: jest.fn().mockImplementation(async () => {
        callOrder.push('lock');
        return 1;
      }),
      $queryRaw: jest.fn().mockImplementation(async () => {
        callOrder.push('selectForUpdate');
        return [{ id: 'corr-1' }];
      }),
      correlativo: {
        findUnique: jest.fn().mockResolvedValue(activeRow),
        update: jest.fn().mockImplementation(async () => {
          callOrder.push('updateCurrent');
          return { ...activeRow, currentNumber: 6 };
        }),
      },
    };
    const prisma = {
      $transaction: jest
        .fn()
        .mockImplementation((cb: (client: unknown) => Promise<unknown>) =>
          cb(tx),
        ),
    };

    const repo = new PrismaCorrelativosRepository(prisma as never);
    const result = await repo.consumeNext(DocumentType.FACTURA);

    expect(result.issuedNumber).toBe(5);
    expect(result.nextNumber).toBe(6);
    expect(callOrder).toEqual(['lock', 'selectForUpdate', 'updateCurrent']);
  });
});
