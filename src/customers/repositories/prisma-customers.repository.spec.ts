import { ConflictException } from '@nestjs/common';
import { PrismaCustomersRepository } from './prisma-customers.repository';

describe('Customer identity protection', () => {
  it('rechaza coincidencias sin sobrescribir datos', async () => {
    const customer = {
      findFirst: jest.fn().mockResolvedValue({ id: 'existing' }),
      update: jest.fn(),
      create: jest.fn(),
    };
    const repository = new PrismaCustomersRepository({ customer } as never);
    await expect(
      repository.upsertByName({ name: 'Ana', phone: '123' }),
    ).rejects.toThrow(ConflictException);
    expect(customer.update).not.toHaveBeenCalled();
    expect(customer.create).not.toHaveBeenCalled();
  });
  it('no consulta toda la base con una búsqueda vacía', async () => {
    const customer = { findMany: jest.fn() };
    const repository = new PrismaCustomersRepository({ customer } as never);
    expect(await repository.search('  ')).toEqual([]);
    expect(customer.findMany).not.toHaveBeenCalled();
  });
});
