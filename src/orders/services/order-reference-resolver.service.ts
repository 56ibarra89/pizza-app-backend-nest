import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface OrderReferenceInput {
  shiftId?: string;
  customerId?: string;
  customerSnapshotName?: string;
  customerPhone?: string;
  customerAddress?: string;
  cashierId?: string;
  cashierSnapshotName?: string;
}

export interface ResolvedOrderReferences {
  shiftId?: string;
  customerId?: string;
  cashierId?: string;
}

@Injectable()
export class OrderReferenceResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(input: OrderReferenceInput): Promise<ResolvedOrderReferences> {
    const [fallbackShiftId, fallbackCustomerId, fallbackCashierId] =
      await Promise.all([
        input.shiftId ? undefined : this.findActiveShiftId(),
        input.customerId
          ? this.attachPhoneToExistingCustomer(
              input.customerId,
              input.customerPhone,
              input.customerAddress,
            )
          : this.findOrCreateCustomerId(
              input.customerSnapshotName,
              input.customerPhone,
              input.customerAddress,
            ),
        input.cashierId
          ? undefined
          : this.findCashierId(input.cashierSnapshotName),
      ]);

    return {
      shiftId: input.shiftId ?? fallbackShiftId,
      customerId: input.customerId ?? fallbackCustomerId,
      cashierId: input.cashierId ?? fallbackCashierId,
    };
  }

  private async findActiveShiftId(): Promise<string | undefined> {
    const activeShift = await this.prisma.shift.findFirst({
      where: { status: 'OPEN' },
      select: { id: true },
      orderBy: { startTime: 'desc' },
    });

    return activeShift?.id;
  }

  private async attachPhoneToExistingCustomer(
    customerId: string,
    customerPhone?: string,
    customerAddress?: string,
  ): Promise<undefined> {
    const phone = customerPhone?.trim();
    const address = customerAddress?.trim();
    const now = new Date();

    if (phone) {
      try {
        const existingPhone = await this.prisma.customerPhone.findFirst({
          where: { customerId, phone },
        });
        if (existingPhone) {
          await this.prisma.customerPhone.update({
            where: { id: existingPhone.id },
            data: { lastUsed: now },
          });
        } else {
          await this.prisma.customerPhone.create({
            data: { customerId, phone, lastUsed: now },
          });
          await this.prisma.customer.update({
            where: { id: customerId },
            data: { phone },
          });
        }
      } catch {
        // Ignorar error secundario
      }
    }

    if (address) {
      try {
        const addrLower = address.toLowerCase();
        const existingAddresses = await this.prisma.customerAddress.findMany({
          where: { customerId },
        });
        const matched = existingAddresses.find(
          (a) => a.address.toLowerCase() === addrLower,
        );
        if (matched) {
          await this.prisma.customerAddress.update({
            where: { id: matched.id },
            data: { lastUsed: now },
          });
        } else {
          await this.prisma.customerAddress.create({
            data: { customerId, address, lastUsed: now },
          });
        }
      } catch {
        // Ignorar error secundario
      }
    }

    return undefined;
  }

  private async findOrCreateCustomerId(
    customerName?: string,
    customerPhone?: string,
    customerAddress?: string,
  ): Promise<string | undefined> {
    const normalizedPhone = customerPhone?.trim();
    const normalizedName = customerName?.trim();
    const normalizedAddress = customerAddress?.trim();
    const now = new Date();

    // 1. Si se proporciona teléfono, buscar en Customer o CustomerPhone
    if (normalizedPhone) {
      const byPhone = await this.prisma.customer.findFirst({
        where: {
          OR: [
            { phone: normalizedPhone },
            { phones: { some: { phone: normalizedPhone } } },
          ],
        },
        select: { id: true },
      });
      if (byPhone) {
        await this.attachPhoneToExistingCustomer(byPhone.id, normalizedPhone, normalizedAddress);
        return byPhone.id;
      }
    }

    // 2. Si no se encontró por teléfono pero se dio un nombre, buscar por nombre
    if (normalizedName) {
      const byName = await this.prisma.customer.findFirst({
        where: { name: { equals: normalizedName, mode: 'insensitive' } },
        select: { id: true },
      });
      if (byName) {
        await this.attachPhoneToExistingCustomer(byName.id, normalizedPhone, normalizedAddress);
        return byName.id;
      }
    }

    // 3. Si no existe, crear un nuevo cliente independiente con su propio UUID
    if (normalizedName || normalizedPhone) {
      try {
        const name = normalizedName || `Cliente ${normalizedPhone}`;
        const created = await this.prisma.customer.create({
          data: {
            name,
            phone: normalizedPhone || null,
            phones: normalizedPhone
              ? {
                  create: {
                    phone: normalizedPhone,
                    lastUsed: now,
                  },
                }
              : undefined,
            addresses: normalizedAddress
              ? {
                  create: {
                    address: normalizedAddress,
                    lastUsed: now,
                  },
                }
              : undefined,
          },
          select: { id: true },
        });
        return created.id;
      } catch {
        return undefined;
      }
    }

    return undefined;
  }

  private async findCashierId(
    cashierName?: string,
  ): Promise<string | undefined> {
    const username = cashierName?.trim();
    if (!username) return undefined;

    const cashier = await this.prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });
    if (cashier) return cashier.id;

    const normalizedUsername = username.toLowerCase();
    if (normalizedUsername === username) return undefined;

    const normalizedCashier = await this.prisma.user.findUnique({
      where: { username: normalizedUsername },
      select: { id: true },
    });

    return normalizedCashier?.id;
  }
}
