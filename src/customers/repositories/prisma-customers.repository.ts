import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { ICustomersRepository } from '../interfaces/customers.repository';
import type { CustomerEntity } from '../entities/customer.entity';
import type { UpdateCustomerDto } from '../dto/update-customer.dto';

const CUSTOMER_INCLUDE = {
  phones: {
    orderBy: [{ isDefault: 'desc' as const }, { lastUsed: 'desc' as const }],
  },
  addresses: {
    orderBy: [{ isDefault: 'desc' as const }, { lastUsed: 'desc' as const }],
  },
};

@Injectable()
export class PrismaCustomersRepository implements ICustomersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getPage(page: number, limit: number, query = '') {
    const q = query.trim();
    const where = q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' as const } },
            { phone: { contains: q } },
            { phones: { some: { phone: { contains: q } } } },
          ],
        }
      : {};
    const [rows, total] = await this.prisma.$transaction(
      [
        this.prisma.customer.findMany({
          where,
          skip: page * limit,
          take: limit,
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          include: CUSTOMER_INCLUDE,
        }),
        this.prisma.customer.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return { items: rows.map((row) => this.mapCustomer(row)), total };
  }

  async getAll(): Promise<CustomerEntity[]> {
    const customers = await this.prisma.customer.findMany({
      orderBy: { name: 'asc' },
      include: CUSTOMER_INCLUDE,
    });
    return customers.map((c) => this.mapCustomer(c));
  }

  async search(query: string): Promise<CustomerEntity[]> {
    const q = query.trim();
    if (!q) return [];

    const customers = await this.prisma.customer.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q } },
          { phones: { some: { phone: { contains: q } } } },
        ],
      },
      take: 20,
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

  private normalizePhoneList(
    phones: Array<{ phone: string; isDefault?: boolean }>,
  ): Array<{ phone: string; isDefault: boolean }> {
    const phoneMap = new Map<string, { phone: string; isDefault?: boolean }>();
    for (const p of phones) {
      const cleanPhone = p.phone.trim();
      if (!cleanPhone) continue;
      const prev = phoneMap.get(cleanPhone);
      phoneMap.set(cleanPhone, {
        phone: cleanPhone,
        isDefault: Boolean(prev?.isDefault || p.isDefault),
      });
    }
    const items = Array.from(phoneMap.values());
    if (items.length === 0) return [];
    const foundDefault = items.findIndex((p) => p.isDefault);
    const defaultIndex = foundDefault >= 0 ? foundDefault : 0;
    return items.map((item, idx) => ({
      phone: item.phone,
      isDefault: idx === defaultIndex,
    }));
  }

  private normalizeAddressList(
    addresses: Array<{ address: string; isDefault?: boolean }>,
  ): Array<{ address: string; isDefault: boolean }> {
    const addressMap = new Map<
      string,
      { address: string; isDefault?: boolean }
    >();
    for (const a of addresses) {
      const cleanAddress = a.address.trim();
      if (!cleanAddress) continue;
      const key = cleanAddress.toLowerCase();
      const prev = addressMap.get(key);
      addressMap.set(key, {
        address: prev?.address ?? cleanAddress,
        isDefault: Boolean(prev?.isDefault || a.isDefault),
      });
    }
    const items = Array.from(addressMap.values());
    if (items.length === 0) return [];
    const foundDefault = items.findIndex((a) => a.isDefault);
    const defaultIndex = foundDefault >= 0 ? foundDefault : 0;
    return items.map((item, idx) => ({
      address: item.address,
      isDefault: idx === defaultIndex,
    }));
  }

  async create(params: {
    name: string;
    phone?: string;
    address?: string;
    phones?: Array<{ phone: string; isDefault?: boolean }>;
    addresses?: Array<{ address: string; isDefault?: boolean }>;
  }): Promise<CustomerEntity> {
    const cleanName = params.name.trim();
    const rawPhones = [
      ...(params.phones ?? []),
      ...(params.phone?.trim() ? [{ phone: params.phone.trim() }] : []),
    ];
    const normalizedPhones = this.normalizePhoneList(rawPhones);
    const primaryPhone =
      normalizedPhones.find((p) => p.isDefault)?.phone ??
      normalizedPhones[0]?.phone ??
      null;

    const rawAddresses = [
      ...(params.addresses ?? []),
      ...(params.address?.trim() ? [{ address: params.address.trim() }] : []),
    ];
    const normalizedAddresses = this.normalizeAddressList(rawAddresses);
    const now = new Date();

    const created = await this.prisma.customer.create({
      data: {
        name: cleanName,
        phone: primaryPhone,
        phones:
          normalizedPhones.length > 0
            ? {
                create: normalizedPhones.map((p) => ({
                  phone: p.phone,
                  isDefault: p.isDefault,
                  lastUsed: now,
                })),
              }
            : undefined,
        addresses:
          normalizedAddresses.length > 0
            ? {
                create: normalizedAddresses.map((a) => ({
                  address: a.address,
                  isDefault: a.isDefault,
                  lastUsed: now,
                })),
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
    const phone = params.phone?.trim();
    const name = params.name.trim();
    const existing = await this.prisma.customer.findFirst({
      where: {
        OR: [
          { name: { equals: name, mode: 'insensitive' } },
          ...(phone ? [{ phone }, { phones: { some: { phone } } }] : []),
        ],
      },
      select: { id: true },
    });
    if (existing)
      throw new ConflictException(
        'Hay clientes coincidentes. Selecciona uno por su ID o crea explícitamente un cliente nuevo.',
      );
    return {
      customer: await this.create({ ...params, name, phone }),
      isNew: true,
    };
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
      await tx.$queryRaw`SELECT id FROM "Customer" WHERE id = ${id} FOR UPDATE`;

      // 1. Manejar sincronización completa de teléfonos si se envió el array
      if (Array.isArray(dto.phones)) {
        const existingPhones = await tx.customerPhone.findMany({
          where: { customerId: id },
        });

        const incomingPhones = this.normalizePhoneList(dto.phones);

        // Teléfonos a eliminar (no presentes en el array entrante)
        const phonesToDelete = existingPhones.filter(
          (ep) => !incomingPhones.some((ip) => ip.phone === ep.phone),
        );
        for (const dp of phonesToDelete) {
          await tx.customerPhone.delete({ where: { id: dp.id } });
        }

        let primaryPhoneValue: string | null = null;

        for (let i = 0; i < incomingPhones.length; i++) {
          const ip = incomingPhones[i];
          const isDef = ip.isDefault;
          if (isDef) primaryPhoneValue = ip.phone;

          const matched = existingPhones.find((ep) => ep.phone === ip.phone);
          if (matched) {
            await tx.customerPhone.update({
              where: { id: matched.id },
              data: {
                isDefault: isDef,
                lastUsed: isDef ? now : matched.lastUsed,
              },
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
        const cleanPhone = dto.phone?.trim() || null;
        data.phone = cleanPhone;

        await tx.customerPhone.updateMany({
          where: {
            customerId: id,
            isDefault: true,
            ...(cleanPhone ? { phone: { not: cleanPhone } } : {}),
          },
          data: { isDefault: false },
        });

        if (cleanPhone) {
          await tx.customerPhone.upsert({
            where: { customerId_phone: { customerId: id, phone: cleanPhone } },
            update: { isDefault: true, lastUsed: now },
            create: {
              customerId: id,
              phone: cleanPhone,
              isDefault: true,
              lastUsed: now,
            },
          });
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

        const incomingAddresses = this.normalizeAddressList(dto.addresses);

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

        for (let i = 0; i < incomingAddresses.length; i++) {
          const ia = incomingAddresses[i];
          const isDef = ia.isDefault;
          const addrLower = ia.address.toLowerCase();

          const matched = existingAddresses.find(
            (ea) => ea.address.toLowerCase() === addrLower,
          );

          if (matched) {
            await tx.customerAddress.update({
              where: { id: matched.id },
              data: {
                isDefault: isDef,
                lastUsed: isDef ? now : matched.lastUsed,
              },
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
    phones?: {
      id: string;
      phone: string;
      isDefault?: boolean;
      lastUsed: Date;
    }[];
    addresses: {
      id: string;
      address: string;
      isDefault?: boolean;
      lastUsed: Date;
    }[];
  }): CustomerEntity {
    return {
      id: c.id,
      name: c.name,
      phone:
        c.phones?.find((phone) => phone.isDefault)?.phone ?? c.phone ?? undefined,
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
