import { OrderReferenceResolverService } from './order-reference-resolver.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('OrderReferenceResolverService', () => {
  it('no vincula ni crea un cliente cuando solo se proporciona un nombre', async () => {
    const prisma = {
      customer: { findMany: jest.fn(), create: jest.fn() },
    };
    const service = new OrderReferenceResolverService(prisma as unknown as PrismaService);

    const result = await service.resolve({
      shiftId: 'shift', cashierId: 'cashier', customerSnapshotName: 'Ana',
    });

    expect(result.customerId).toBeUndefined();
    expect(prisma.customer.findMany).not.toHaveBeenCalled();
    expect(prisma.customer.create).not.toHaveBeenCalled();
  });

  it('crea un cliente con teléfono nuevo aunque el nombre exista', async () => {
    const prisma = {
      customer: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'new-customer' }),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((fn) => fn(prisma));
    const service = new OrderReferenceResolverService(prisma as unknown as PrismaService);

    const result = await service.resolve({
      shiftId: 'shift', cashierId: 'cashier', customerSnapshotName: 'Ana', customerPhone: '123',
    });

    expect(result.customerId).toBe('new-customer');
    expect(prisma.customer.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.customer.create).toHaveBeenCalledTimes(1);
  });

  it('no vincula un teléfono compartido por varios clientes', async () => {
    const prisma = { customer: { findMany: jest.fn().mockResolvedValue([{ id: 'a' }, { id: 'b' }]), create: jest.fn() }, $queryRaw: jest.fn().mockResolvedValue([]), $transaction: jest.fn() };
    prisma.$transaction.mockImplementation((fn) => fn(prisma));
    const service = new OrderReferenceResolverService(prisma as unknown as PrismaService);
    const result = await service.resolve({ shiftId: 'shift', cashierId: 'cashier', customerPhone: '123' });
    expect(result.customerId).toBeUndefined();
    expect(prisma.customer.create).not.toHaveBeenCalled();
  });
});
