import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface OrderReferenceInput {
  shiftId?: string;
  customerId?: string;
  customerSnapshotName?: string;
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
          : this.findCustomerId(input.customerSnapshotName),
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

  private async findCustomerId(
    customerName?: string,
  ): Promise<string | undefined> {
    const normalizedName = customerName?.trim();
    if (!normalizedName) return undefined;

    const customer = await this.prisma.customer.findFirst({
      where: { name: { equals: normalizedName, mode: 'insensitive' } },
      select: { id: true },
    });

    return customer?.id;
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
