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

  it('devuelve el teléfono principal registrado y conserva el respaldo legado', async () => {
    const now = new Date();
    const legacy = {
      id: 'legacy',
      name: 'Ana',
      phone: '1111',
      phones: [],
      addresses: [],
      createdAt: now,
      updatedAt: now,
    };
    const customer = {
      findUnique: jest
        .fn()
        .mockResolvedValueOnce(legacy)
        .mockResolvedValueOnce({
          ...legacy,
          phones: [
            { id: 'ph-2', phone: '2222', isDefault: true, lastUsed: now },
          ],
        }),
    };
    const repository = new PrismaCustomersRepository({ customer } as never);

    await expect(repository.findById('legacy')).resolves.toHaveProperty(
      'phone',
      '1111',
    );
    await expect(repository.findById('legacy')).resolves.toHaveProperty(
      'phone',
      '2222',
    );
  });
});
