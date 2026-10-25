import { ForbiddenException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { FinalizeOrderDto } from '../dto/finalize-order.dto';
import type { OrderEntity } from '../entities/order.entity';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { UserRoleDto } from '../../common';
import { assertPaymentsMatchTotal } from '../validators/order-payments.validator';
import { InvoiceIssuingService } from './invoice-issuing.service';
import { OrderPricingService } from './order-pricing.service';
import type { OrderTotals } from '../types/order-totals';
import type { ResolvedOrderPromotion } from '../types/order-promotion';

@Injectable()
export class OrderFinalizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: OrderPricingService,
    private readonly invoiceIssuing: InvoiceIssuingService,
  ) {}

  async finalize(
    order: OrderEntity,
    dto: FinalizeOrderDto,
    user?: AuthenticatedUser | string,
  ): Promise<void> {
    if (typeof user !== 'string' && user?.role === UserRoleDto.cocinero) {
      throw new ForbiddenException('Los cocineros no pueden facturar órdenes.');
    }

    const promotion = await this.pricing.resolvePromotion(
      dto,
      {
        cuponId: order.cuponId,
        discountId: order.discountId,
        happyHourId: order.happyHourId,
      },
      order.timestamp,
    );
    const calculatedTotals = await this.pricing.calculate(
      order.items,
      promotion,
    );
    const hasSplitAdjustedDiscount =
      typeof order.discountAmount === 'number' &&
      order.discountAmount >= 0 &&
      ((promotion.source === 'none' && order.discountAmount > 0) ||
        (promotion.source !== 'none' &&
          order.discountAmount + 0.01 < calculatedTotals.discountAmount));
    const totals = hasSplitAdjustedDiscount
      ? await this.pricing.calculate(
          order.items,
          promotion,
          order.discountAmount,
        )
      : calculatedTotals;
    const payments = dto.payments ?? order.payments;
    assertPaymentsMatchTotal(totals.total, payments);

    await this.prisma.$transaction((tx) =>
      this.invoiceIssuing.issue(tx, {
        orderId: order.id,
        dto,
        totals,
        promotion,
      }),
    );
  }

  async issueInTransaction(
    tx: Prisma.TransactionClient,
    params: {
      orderId: string;
      dto: FinalizeOrderDto;
      totals: OrderTotals;
      promotion: ResolvedOrderPromotion;
      skipCouponConsumption?: boolean;
    },
  ): Promise<void> {
    await this.invoiceIssuing.issue(tx, params);
  }
}
