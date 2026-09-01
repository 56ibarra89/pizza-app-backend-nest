import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { ICustomersRepository } from '../interfaces/customers.repository';
import type { CustomerEntity } from '../entities/customer.entity';

@Injectable()
export class PrismaCustomersRepository implements ICustomersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getAll(): Promise<CustomerEntity[]> {
    const customers = await this.prisma.customer.findMany({
      orderBy: { name: 'asc' },
      include: { addresses: { orderBy: { lastUsed: 'desc' } } },
    });
    return customers.map((c) => this.mapCustomer(c));
  }

  async search(query: string): Promise<CustomerEntity[]> {
    const q = query.trim();
    if (!q) return this.getAll();

    const customers = await this.prisma.customer.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q } },
        ],
      },
      orderBy: { name: 'asc' },
      include: { addresses: { orderBy: { lastUsed: 'desc' } } },
    });
    return customers.map((c) => this.mapCustomer(c));
  }

  async findById(id: string): Promise<CustomerEntity | null> {
    const found = await this.prisma.customer.findUnique({
      where: { id },
      include: { addresses: { orderBy: { lastUsed: 'desc' } } },
    });
    return found ? this.mapCustomer(found) : null;
  }

  async findByNameLower(nameLower: string): Promise<CustomerEntity | null> {
    const found = await this.prisma.customer.findFirst({
      where: { name: { equals: nameLower, mode: 'insensitive' } },
      include: { addresses: { orderBy: { lastUsed: 'desc' } } },
    });
    return found ? this.mapCustomer(found) : null;
  }

  async create(params: {
    name: string;
    phone?: string;
    address?: string;
  }): Promise<CustomerEntity> {
    const cleanName = params.name.trim();
    const phone = params.phone?.trim() || undefined;
    const address = params.address?.trim() || undefined;
    const now = new Date();

    const created = await this.prisma.customer.create({
      data: {
        name: cleanName,
        phone: phone || null,
        addresses: address
          ? {
              create: [{ address, lastUsed: now }],
            }
          : undefined,
      },
      include: { addresses: { orderBy: { lastUsed: 'desc' } } },
    });

    return this.mapCustomer(created);
  }

  async upsertByName(params: {
    name: string;
    phone?: string;
    address?: string;
  }): Promise<{ customer: CustomerEntity; isNew: boolean }> {
    const now = new Date();
    const cleanName = params.name.trim();
    const nameLower = cleanName.toLowerCase();
    const phone = params.phone?.trim() || undefined;
    const address = params.address?.trim() || undefined;

    return this.prisma.$transaction(async (tx) => {
      // Priorizar búsqueda por teléfono si existe para evitar mezclar homónimos
      let existing = phone
        ? await tx.customer.findFirst({
            where: { phone },
            include: { addresses: true },
          })
        : null;

      // Si no se encontró por teléfono y no se dio teléfono, buscar por nombre exacto
      if (!existing && !phone) {
        existing = await tx.customer.findFirst({
          where: { name: { equals: nameLower, mode: 'insensitive' } },
          include: { addresses: true },
        });
      }

      const isNew = !existing;

      if (!existing) {
        const created = await tx.customer.create({
          data: {
            name: cleanName,
            phone: phone || null,
            addresses: address
              ? {
                  create: [{ address, lastUsed: now }],
                }
              : undefined,
          },
          include: { addresses: { orderBy: { lastUsed: 'desc' } } },
        });

        return { customer: this.mapCustomer(created), isNew };
      }

      const updatedCustomer = await tx.customer.update({
        where: { id: existing.id },
        data: {
          name: cleanName,
          phone: phone ?? existing.phone,
        },
      });

      if (address) {
        const addrLower = address.toLowerCase();
        const matched = existing.addresses.find(
          (a) => a.address.toLowerCase() === addrLower,
        );

        if (matched) {
          await tx.customerAddress.update({
            where: { id: matched.id },
            data: { lastUsed: now },
          });
        } else {
          await tx.customerAddress.create({
            data: { customerId: existing.id, address, lastUsed: now },
          });
        }
      }

      const reloaded = await tx.customer.findUniqueOrThrow({
        where: { id: updatedCustomer.id },
        include: { addresses: { orderBy: { lastUsed: 'desc' } } },
      });

      return { customer: this.mapCustomer(reloaded), isNew };
    });
  }

  async updateById(
    id: string,
    dto: { name?: string; phone?: string; address?: string },
  ): Promise<CustomerEntity> {
    const data: { name?: string; phone?: string | null } = {};

    if (dto.name !== undefined) {
      const clean = dto.name.trim();
      data.name = clean;
    }
    if (dto.phone !== undefined) {
      data.phone = dto.phone.trim() || null;
    }

    const now = new Date();
    const address = dto.address?.trim();

    return this.prisma.$transaction(async (tx) => {
      await tx.customer.update({
        where: { id },
        data,
      });

      if (address) {
        const addrLower = address.toLowerCase();
        const existingAddresses = await tx.customerAddress.findMany({
          where: { customerId: id },
        });

        const matched = existingAddresses.find(
          (a) => a.address.toLowerCase() === addrLower,
        );

        if (matched) {
          await tx.customerAddress.update({
            where: { id: matched.id },
            data: { lastUsed: now },
          });
        } else {
          await tx.customerAddress.create({
            data: { customerId: id, address, lastUsed: now },
          });
        }
      }

      const reloaded = await tx.customer.findUniqueOrThrow({
        where: { id },
        include: { addresses: { orderBy: { lastUsed: 'desc' } } },
      });

      return this.mapCustomer(reloaded);
    });
  }

  async deleteById(id: string): Promise<void> {
    await this.prisma.customer.delete({ where: { id } });
  }

  private mapCustomer(c: {
    id: string;
    name: string;
    phone: string | null;
    createdAt: Date;
    updatedAt: Date;
    addresses: { id: string; address: string; lastUsed: Date }[];
  }): CustomerEntity {
    return {
      id: c.id,
      name: c.name,
      phone: c.phone ?? undefined,
      addresses: c.addresses.map((a) => ({
        id: a.id,
        address: a.address,
        lastUsed: a.lastUsed,
      })),
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
  }
}
