import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { FinalizeOrderDto } from '../dto/finalize-order.dto';
import type { OrderEntity } from '../entities/order.entity';
import type { CartItemEntity } from '../entities/order-item.entity';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { UserRoleDto } from '../../common';
import { assertPaymentsMatchTotal } from '../validators/order-payments.validator';
import {
  getSplitFamilyState,
  isSameStoredPromotion,
  isSplitDiscountAdjustmentCandidate,
} from '../validators/order-promotion.validator';
import { InvoiceIssuingService } from './invoice-issuing.service';
import { OrderPricingService } from './order-pricing.service';
import type { OrderTotals } from '../types/order-totals';
import type { ResolvedOrderPromotion } from '../types/order-promotion';
import { OrderStatusDto } from '../dto/order-status.dto';
import { getBusinessDayBounds } from '../../common/time/business-time.util';

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
    externalTx?: Prisma.TransactionClient,
  ): Promise<void> {
    if (order.status === OrderStatusDto.cancelled) {
      throw new BadRequestException(
        'No se puede cobrar ni facturar una orden anulada.',
      );
    }
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
    const splitFamily = await getSplitFamilyState(this.prisma, {
      orderId: order.id,
      items: order.items,
      cuponId: promotion.source === 'coupon' ? promotion.cuponId : null,
    });
    const sameStoredPromotion = isSameStoredPromotion(order, promotion);
    const preserveSplitDiscountForConsumedCoupon =
      splitFamily.hasSplitHistory &&
      splitFamily.couponAlreadyConsumedBySplit &&
      sameStoredPromotion &&
      typeof order.discountAmount === 'number' &&
      order.discountAmount >= 0;

    let pricedItems: CartItemEntity[];
    let totals: OrderTotals;
    if (preserveSplitDiscountForConsumedCoupon) {
      // Un cobro dividido previo ya consumió el cupón en BD; conservar el
      // remanente del padre evita recalcular y fallar si maxUses quedó en 0.
      const preserved = await this.pricing.calculateWithPrices(
        order.items,
        promotion,
        order.discountAmount ?? 0,
        { useSnapshotPrices: true },
      );
      pricedItems = preserved.items;
      totals = preserved.totals;
    } else {
      const unadjusted = await this.pricing.calculateWithPrices(
        order.items,
        promotion,
        undefined,
        { useSnapshotPrices: true },
      );
      const hasSplitAdjustedDiscount = isSplitDiscountAdjustmentCandidate({
        hasSplitHistory: splitFamily.hasSplitHistory,
        sameStoredPromotion,
        storedDiscountAmount: order.discountAmount,
        promotion,
        calculatedDiscountAmount: unadjusted.totals.discountAmount,
      });
      const recalculated = hasSplitAdjustedDiscount
        ? await this.pricing.calculateWithPrices(
            order.items,
            promotion,
            order.discountAmount,
            { useSnapshotPrices: true },
          )
        : unadjusted;
      pricedItems = recalculated.items;
      totals = recalculated.totals;
    }

    const payments = dto.payments ?? order.payments;
    assertPaymentsMatchTotal(totals.total, payments);

    const isDriverActor =
      typeof user !== 'string' && user?.role === UserRoleDto.motorizado;
    const resolvedCashierId =
      typeof user === 'string'
        ? undefined
        : isDriverActor
          ? order.cashierId
          : user?.id;
    const resolvedCashierSnapshotName =
      typeof user === 'string'
        ? user === 'system'
          ? undefined
          : user
        : isDriverActor
          ? order.cashierSnapshotName
          : user?.username;

    const issueInvoice = (tx: Prisma.TransactionClient) =>
      this.invoiceIssuing.issue(tx, {
        orderId: order.id,
        dto,
        totals,
        items: pricedItems,
        expectedUpdatedAt: dto.expectedUpdatedAt
          ? new Date(dto.expectedUpdatedAt)
          : order.updatedAt,
        promotion,
        skipCouponConsumption: splitFamily.couponAlreadyConsumedBySplit,
        cashierId: resolvedCashierId,
        cashierSnapshotName: resolvedCashierSnapshotName,
      });

    if (externalTx) {
      await issueInvoice(externalTx);
      return;
    }

    try {
      await this.prisma.$transaction((tx) => issueInvoice(tx));
    } catch (error) {
      await this.persistTerminalCorrelativoStatusIfNeeded(error);
      throw error;
    }
  }

  async issueInTransaction(
    tx: Prisma.TransactionClient,
    params: {
      orderId: string;
      dto: FinalizeOrderDto;
      totals: OrderTotals;
      promotion: ResolvedOrderPromotion;
      skipCouponConsumption?: boolean;
      cashierId?: string;
      cashierSnapshotName?: string;
    },
  ): Promise<void> {
    await this.invoiceIssuing.issue(tx, params);
  }

  async persistTerminalCorrelativoStatusIfNeeded(
    error: unknown,
  ): Promise<void> {
    if (
      !(error instanceof BadRequestException) ||
      !this.prisma.correlativo?.updateMany
    ) {
      return;
    }
    if (error.message === 'El correlativo está VENCIDO') {
      // La comparación debe incluir correlativos heredados guardados a
      // medianoche UTC: un documento vence al terminar su día comercial, no
      // al llegar las 6 p. m. de Managua.
      const { startOfDay } = getBusinessDayBounds(new Date());
      await this.prisma.correlativo.updateMany({
        where: {
          documentType: 'FACTURA',
          status: 'ACTIVO',
          expirationDate: { lt: startOfDay },
        },
        data: { status: 'VENCIDO' },
      });
    } else if (error.message === 'El correlativo está AGOTADO') {
      const active = await this.prisma.correlativo.findFirst?.({
        where: { documentType: 'FACTURA', status: 'ACTIVO' },
        orderBy: { createdAt: 'desc' },
      });
      if (active && active.currentNumber > active.endNumber) {
        await this.prisma.correlativo.update({
          where: { id: active.id },
          data: { status: 'AGOTADO' },
        });
      }
    }
  }
}
