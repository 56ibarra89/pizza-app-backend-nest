import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface OrderReferenceInput {
  shiftId?: string;
  customerId?: string;
  customerPhone?: string;
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
    const [shiftId, customerId, cashierId] = await Promise.all([
      input.shiftId ?? this.findActiveShiftId(),
      input.customerId ?? this.findCustomerIdByPhone(input.customerPhone),
      input.cashierId ?? this.findCashierId(input.cashierSnapshotName),
    ]);

    return {
      shiftId,
      customerId,
      cashierId,
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

  private async findCustomerIdByPhone(
    customerPhone?: string,
  ): Promise<string | undefined> {
    const phone = customerPhone?.trim();
    if (!phone) return undefined;

    const matches = await this.prisma.customer.findMany({
      where: {
        OR: [{ phone }, { phones: { some: { phone } } }],
      },
      select: { id: true },
      take: 2,
    });
    return matches.length === 1 ? matches[0].id : undefined;
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
