import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { ICustomersRepository } from '../interfaces/customers.repository';
import type { CustomerEntity } from '../entities/customer.entity';
import type { UpdateCustomerDto } from '../dto/update-customer.dto';

const CUSTOMER_INCLUDE = {
  phones: {
    orderBy: [
      { isDefault: 'desc' as const },
      { lastUsed: 'desc' as const },
    ],
  },
  addresses: {
    orderBy: [
      { isDefault: 'desc' as const },
      { lastUsed: 'desc' as const },
    ],
  },
};

@Injectable()
export class PrismaCustomersRepository implements ICustomersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getAll(): Promise<CustomerEntity[]> {
    const customers = await this.prisma.customer.findMany({
      orderBy: { name: 'asc' },
      include: CUSTOMER_INCLUDE,
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
          { phones: { some: { phone: { contains: q } } } },
        ],
      },
      orderBy: { name: 'asc' },
      include: CUSTOMER_INCLUDE,
    });
    return customers.map((c) => this.mapCustomer(c));
  }

  async findById(id: string): Promise<CustomerEntity | null> {
    const found = await this.prisma.customer.findUnique({
      where: { id },
      include: CUSTOMER_INCLUDE,
    });
    return found ? this.mapCustomer(found) : null;
  }

  async findByNameLower(nameLower: string): Promise<CustomerEntity | null> {
    const found = await this.prisma.customer.findFirst({
      where: { name: { equals: nameLower, mode: 'insensitive' } },
      include: CUSTOMER_INCLUDE,
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
        phones: phone
          ? {
              create: [{ phone, isDefault: true, lastUsed: now }],
            }
          : undefined,
        addresses: address
          ? {
              create: [{ address, isDefault: true, lastUsed: now }],
            }
          : undefined,
      },
      include: CUSTOMER_INCLUDE,
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
      // 1. Priorizar búsqueda por teléfono en Customer o en CustomerPhone
      let existing = phone
        ? await tx.customer.findFirst({
            where: {
              OR: [
                { phone },
                { phones: { some: { phone } } },
              ],
            },
            include: CUSTOMER_INCLUDE,
          })
        : null;

      // 2. Si no se encontró por teléfono (o es un número nuevo), buscar por nombre del cliente
      if (!existing && cleanName) {
        existing = await tx.customer.findFirst({
          where: { name: { equals: nameLower, mode: 'insensitive' } },
          include: CUSTOMER_INCLUDE,
        });
      }

      const isNew = !existing;

      if (!existing) {
        const created = await tx.customer.create({
          data: {
            name: cleanName,
            phone: phone || null,
            phones: phone
              ? {
                  create: [{ phone, isDefault: true, lastUsed: now }],
                }
              : undefined,
            addresses: address
              ? {
                  create: [{ address, isDefault: true, lastUsed: now }],
                }
              : undefined,
          },
          include: CUSTOMER_INCLUDE,
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

      if (phone) {
        const matchedPhone = existing.phones.find((p) => p.phone === phone);
        if (matchedPhone) {
          await tx.customerPhone.update({
            where: { id: matchedPhone.id },
            data: { lastUsed: now },
          });
        } else {
          await tx.customerPhone.create({
            data: { customerId: existing.id, phone, lastUsed: now },
          });
        }
      }

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
        include: CUSTOMER_INCLUDE,
      });

      return { customer: this.mapCustomer(reloaded), isNew };
    });
  }

  async updateById(
    id: string,
    dto: UpdateCustomerDto,
  ): Promise<CustomerEntity> {
    const data: { name?: string; phone?: string | null } = {};

    if (dto.name !== undefined) {
      const clean = dto.name.trim();
      data.name = clean;
    }

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      // 1. Manejar sincronización completa de teléfonos si se envió el array
      if (Array.isArray(dto.phones)) {
        const existingPhones = await tx.customerPhone.findMany({
          where: { customerId: id },
        });

        const incomingPhones = dto.phones
          .map((p) => ({ ...p, phone: p.phone.trim() }))
          .filter((p) => Boolean(p.phone));

        // Teléfonos a eliminar (no presentes en el array entrante)
        const phonesToDelete = existingPhones.filter(
          (ep) => !incomingPhones.some((ip) => ip.phone === ep.phone),
        );
        for (const dp of phonesToDelete) {
          await tx.customerPhone.delete({ where: { id: dp.id } });
        }

        // Determinar cuál es el default (el primero marcado con isDefault, o el primero de la lista si ninguno lo está)
        const hasDefault = incomingPhones.some((p) => p.isDefault);
        const defaultIndex = hasDefault
          ? incomingPhones.findIndex((p) => p.isDefault)
          : 0;

        let primaryPhoneValue: string | null = null;

        for (let i = 0; i < incomingPhones.length; i++) {
          const ip = incomingPhones[i];
          const isDef = i === defaultIndex;
          if (isDef) primaryPhoneValue = ip.phone;

          const matched = existingPhones.find((ep) => ep.phone === ip.phone);
          if (matched) {
            await tx.customerPhone.update({
              where: { id: matched.id },
              data: { isDefault: isDef, lastUsed: isDef ? now : matched.lastUsed },
            });
          } else {
            await tx.customerPhone.create({
              data: {
                customerId: id,
                phone: ip.phone,
                isDefault: isDef,
                lastUsed: now,
              },
            });
          }
        }

        data.phone = primaryPhoneValue;
      } else if (dto.phone !== undefined) {
        const cleanPhone = dto.phone.trim() || null;
        data.phone = cleanPhone;

        if (cleanPhone) {
          const existingPhones = await tx.customerPhone.findMany({
            where: { customerId: id },
          });
          const matched = existingPhones.find((p) => p.phone === cleanPhone);
          if (matched) {
            await tx.customerPhone.update({
              where: { id: matched.id },
              data: { lastUsed: now },
            });
          } else {
            await tx.customerPhone.create({
              data: { customerId: id, phone: cleanPhone, lastUsed: now },
            });
          }
        }
      }

      await tx.customer.update({
        where: { id },
        data,
      });

      // 2. Manejar sincronización completa de direcciones si se envió el array
      if (Array.isArray(dto.addresses)) {
        const existingAddresses = await tx.customerAddress.findMany({
          where: { customerId: id },
        });

        const incomingAddresses = dto.addresses
          .map((a) => ({ ...a, address: a.address.trim() }))
          .filter((a) => Boolean(a.address));

        // Direcciones a eliminar
        const addressesToDelete = existingAddresses.filter(
          (ea) =>
            !incomingAddresses.some(
              (ia) => ia.address.toLowerCase() === ea.address.toLowerCase(),
            ),
        );
        for (const da of addressesToDelete) {
          await tx.customerAddress.delete({ where: { id: da.id } });
        }

        // Determinar dirección default
        const hasDefault = incomingAddresses.some((a) => a.isDefault);
        const defaultIndex = hasDefault
          ? incomingAddresses.findIndex((a) => a.isDefault)
          : 0;

        for (let i = 0; i < incomingAddresses.length; i++) {
          const ia = incomingAddresses[i];
          const isDef = i === defaultIndex;
          const addrLower = ia.address.toLowerCase();

          const matched = existingAddresses.find(
            (ea) => ea.address.toLowerCase() === addrLower,
          );

          if (matched) {
            await tx.customerAddress.update({
              where: { id: matched.id },
              data: { isDefault: isDef, lastUsed: isDef ? now : matched.lastUsed },
            });
          } else {
            await tx.customerAddress.create({
              data: {
                customerId: id,
                address: ia.address,
                isDefault: isDef,
                lastUsed: now,
              },
            });
          }
        }
      } else if (dto.address) {
        const cleanAddress = dto.address.trim();
        const addrLower = cleanAddress.toLowerCase();
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
            data: { customerId: id, address: cleanAddress, lastUsed: now },
          });
        }
      }

      const reloaded = await tx.customer.findUniqueOrThrow({
        where: { id },
        include: CUSTOMER_INCLUDE,
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
    phones?: { id: string; phone: string; isDefault?: boolean; lastUsed: Date }[];
    addresses: { id: string; address: string; isDefault?: boolean; lastUsed: Date }[];
  }): CustomerEntity {
    return {
      id: c.id,
      name: c.name,
      phone: c.phone ?? undefined,
      phones: (c.phones || []).map((p) => ({
        id: p.id,
        phone: p.phone,
        isDefault: Boolean(p.isDefault),
        lastUsed: p.lastUsed,
      })),
      addresses: (c.addresses || []).map((a) => ({
        id: a.id,
        address: a.address,
        isDefault: Boolean(a.isDefault),
        lastUsed: a.lastUsed,
      })),
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
  }
}
