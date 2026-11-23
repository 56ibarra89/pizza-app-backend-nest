import { OrderReferenceResolverService } from './order-reference-resolver.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('OrderReferenceResolverService', () => {
  it('no busca clientes si no se proporciona un teléfono ni un ID', async () => {
    const prisma = {
      customer: { findMany: jest.fn(), create: jest.fn() },
    };
    const service = new OrderReferenceResolverService(
      prisma as unknown as PrismaService,
    );

    const result = await service.resolve({
      shiftId: 'shift',
      cashierId: 'cashier',
    });

    expect(result.customerId).toBeUndefined();
    expect(prisma.customer.findMany).not.toHaveBeenCalled();
    expect(prisma.customer.create).not.toHaveBeenCalled();
  });

  it('deja un teléfono nuevo como contacto de la orden sin crear una ficha', async () => {
    const prisma = {
      customer: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    const service = new OrderReferenceResolverService(
      prisma as unknown as PrismaService,
    );

    const result = await service.resolve({
      shiftId: 'shift',
      cashierId: 'cashier',
      customerPhone: '123',
    });

    expect(result.customerId).toBeUndefined();
    expect(prisma.customer.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.customer.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('conserva el vínculo si el teléfono identifica una sola ficha, sin editarla', async () => {
    const prisma = {
      customer: {
        findMany: jest.fn().mockResolvedValue([{ id: 'existing' }]),
        update: jest.fn(),
      },
      customerPhone: { update: jest.fn(), create: jest.fn() },
      customerAddress: { update: jest.fn(), create: jest.fn() },
    };
    const service = new OrderReferenceResolverService(
      prisma as unknown as PrismaService,
    );

    await expect(
      service.resolve({
        shiftId: 'shift',
        cashierId: 'cashier',
        customerPhone: ' 123 ',
      }),
    ).resolves.toMatchObject({ customerId: 'existing' });
    expect(prisma.customer.findMany).toHaveBeenCalledWith({
      where: { OR: [{ phone: '123' }, { phones: { some: { phone: '123' } } }] },
      select: { id: true },
      take: 2,
    });
    expect(prisma.customer.update).not.toHaveBeenCalled();
    expect(prisma.customerPhone.update).not.toHaveBeenCalled();
    expect(prisma.customerPhone.create).not.toHaveBeenCalled();
    expect(prisma.customerAddress.update).not.toHaveBeenCalled();
    expect(prisma.customerAddress.create).not.toHaveBeenCalled();
  });

  it('respeta un cliente seleccionado aunque el teléfono sea puntual', async () => {
    const service = new OrderReferenceResolverService({} as PrismaService);

    await expect(
      service.resolve({
        shiftId: 'shift',
        cashierId: 'cashier',
        customerId: 'selected',
        customerPhone: '123',
      }),
    ).resolves.toMatchObject({ customerId: 'selected' });
  });

  it('no vincula un teléfono compartido por varios clientes', async () => {
    const prisma = {
      customer: {
        findMany: jest.fn().mockResolvedValue([{ id: 'a' }, { id: 'b' }]),
        create: jest.fn(),
      },
    };
    const service = new OrderReferenceResolverService(
      prisma as unknown as PrismaService,
    );
    const result = await service.resolve({
      shiftId: 'shift',
      cashierId: 'cashier',
      customerPhone: '123',
    });
    expect(result.customerId).toBeUndefined();
    expect(prisma.customer.create).not.toHaveBeenCalled();
  });
});
