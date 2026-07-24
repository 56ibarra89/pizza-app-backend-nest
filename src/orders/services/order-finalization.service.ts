import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { FinalizeOrderDto } from '../dto/finalize-order.dto';
import type { OrderEntity } from '../entities/order.entity';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { UserRoleDto } from '../../users/dto/user-role.dto';
import { assertPaymentsMatchTotal } from '../validators/order-payments.validator';
import { InvoiceIssuingService } from './invoice-issuing.service';
import { OrderPricingService } from './order-pricing.service';

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

    const cuponId = await this.pricing.resolveCouponId(
      dto.cuponId ?? order.cuponId,
      dto.promotionCode,
    );
    const totals = await this.pricing.calculate(
      order.items,
      cuponId,
      dto.discountAmount ?? order.discountAmount,
    );
    const payments = dto.payments ?? order.payments;
    assertPaymentsMatchTotal(totals.total, payments);

    await this.prisma.$transaction((tx) =>
      this.invoiceIssuing.issue(tx, {
        orderId: order.id,
        dto,
        totals,
        cuponId,
      }),
    );
  }
}
