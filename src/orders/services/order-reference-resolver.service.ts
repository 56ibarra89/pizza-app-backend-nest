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
          ? undefined
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

  private async findOrCreateCustomerId(
    customerName?: string,
    customerPhone?: string,
    customerAddress?: string,
  ): Promise<string | undefined> {
    const normalizedPhone = customerPhone?.trim();
    const normalizedName = customerName?.trim();
    const normalizedAddress = customerAddress?.trim();

    if (normalizedPhone) {
      const byPhone = await this.prisma.customer.findFirst({
        where: { phone: normalizedPhone },
        select: { id: true },
      });
      if (byPhone) return byPhone.id;
    }

    if (normalizedName) {
      const byName = await this.prisma.customer.findFirst({
        where: { name: { equals: normalizedName, mode: 'insensitive' } },
        select: { id: true },
      });
      if (byName) return byName.id;
    }

    if (normalizedName || normalizedPhone) {
      try {
        const name = normalizedName || `Cliente ${normalizedPhone}`;
        const created = await this.prisma.customer.create({
          data: {
            name,
            phone: normalizedPhone || null,
            addresses: normalizedAddress
              ? {
                  create: {
                    address: normalizedAddress,
                    lastUsed: new Date(),
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
