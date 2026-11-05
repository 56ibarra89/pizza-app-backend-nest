import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CertificadoStatus,
  CorrelativoStatus,
  CuponManualStatus,
  DocumentType,
  LogLevel,
  Prisma,
  ShiftStatus,
} from '@prisma/client';
import type { FinalizeOrderDto } from '../dto/finalize-order.dto';
import type { CartItemEntity } from '../entities/order-item.entity';
import { OrderStatusDto } from '../dto/order-status.dto';
import {
  toDbOrderStatus,
  toDbOrderType,
  toDbPaymentMethod,
} from '../mappers/status.mapper';
import type { OrderTotals } from '../types/order-totals';
import type { ResolvedOrderPromotion } from '../types/order-promotion';
import { isCouponExpired } from '../../promotions/mappers/promotions.mapper';
import { extractCertificateSerialFromNote } from '../validators/order-certificate.validator';
import {
  getBusinessDateParts,
  getBusinessMonthEnd,
} from '../../common/time/business-time.util';

interface IssueInvoiceParams {
  orderId: string;
  dto: FinalizeOrderDto;
  totals: OrderTotals;
  items?: readonly CartItemEntity[];
  expectedUpdatedAt?: Date;
  promotion: ResolvedOrderPromotion;
  skipCouponConsumption?: boolean;
  cashierId?: string;
  cashierSnapshotName?: string;
}

interface DgiConfig {
  resolutionNumber?: string;
  startNumber?: number | string;
  endNumber?: number | string;
}

interface LockedCoupon {
  id: number;
  manualStatus: CuponManualStatus;
  maxUses: number;
  currentUses: number;
  expiresDate: Date | null;
  deletedAt: Date | null;
}

interface LockedCertificate {
  id: number;
  status: CertificadoStatus;
  deletedAt: Date | null;
}

function readDgiConfig(value: Prisma.JsonValue | null): DgiConfig {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }

  return {
    resolutionNumber:
      typeof value.resolutionNumber === 'string'
        ? value.resolutionNumber
        : undefined,
    startNumber:
      typeof value.startNumber === 'number' ||
      typeof value.startNumber === 'string'
        ? value.startNumber
        : undefined,
    endNumber:
      typeof value.endNumber === 'number' || typeof value.endNumber === 'string'
        ? value.endNumber
        : undefined,
  };
}

@Injectable()
export class InvoiceIssuingService {
  async issue(
    tx: Prisma.TransactionClient,
    {
      orderId,
      dto,
      totals,
      items,
      expectedUpdatedAt,
      promotion,
      skipCouponConsumption,
      cashierId,
      cashierSnapshotName,
    }: IssueInvoiceParams,
  ): Promise<void> {
    const cuponId =
      promotion.source === 'coupon' ? (promotion.cuponId ?? null) : null;
    const discountId =
      promotion.source === 'discount' ? (promotion.discountId ?? null) : null;
    const happyHourId =
      promotion.source === 'happy-hour'
        ? (promotion.happyHourId ?? null)
        : null;
    const lockedOrders = await tx.$queryRaw<
      Array<{ id: string; updatedAt?: Date }>
    >`
      SELECT id, "updatedAt"
      FROM "Order"
      WHERE id = ${orderId}
      FOR UPDATE
    `;
    const lockedOrder = lockedOrders[0];
    if (!lockedOrder) {
      throw new NotFoundException('Orden no encontrada');
    }
    if (
      expectedUpdatedAt &&
      lockedOrder.updatedAt instanceof Date &&
      lockedOrder.updatedAt.getTime() !== expectedUpdatedAt.getTime()
    ) {
      throw new ConflictException(
        'La orden fue modificada mientras se procesaba el cobro. Por favor verifica el pedido e inténtalo nuevamente.',
      );
    }

    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        cashierId: true,
        cashierSnapshotName: true,
        shiftId: true,
        invoiceNumber: true,
        pendingCertificateSerials: true,
      },
    });

    if (!order) throw new NotFoundException('Orden no encontrada');
    if (order.status === 'PAID') return;
    if (order.status === 'CANCELLED') {
      throw new BadRequestException(
        'No se puede cobrar ni facturar una orden anulada.',
      );
    }

    const certificateSerials =
      dto.certificateSerials && dto.certificateSerials.length > 0
        ? dto.certificateSerials
        : Array.isArray(order.pendingCertificateSerials)
          ? order.pendingCertificateSerials.filter(
              (serial): serial is string => typeof serial === 'string',
            )
          : [];

    const status = toDbOrderStatus(OrderStatusDto.paid);
    await this.synchronizeBilledItemPrices(tx, items);
    if (order.invoiceNumber) {
      const now = new Date();
      const shiftId = await this.requireActiveShiftId(tx);

      if (cuponId !== null && !skipCouponConsumption) {
        await this.consumeCoupon(tx, cuponId, now);
      }
      await this.consumeCertificates(tx, certificateSerials, orderId, now);

      await tx.order.update({
        where: { id: orderId },
        data: {
          status,
          shiftId,
          paidAt: now,
          pendingCertificateSerials: Prisma.DbNull,
          ...(dto.payments !== undefined
            ? {
                payments: {
                  deleteMany: {},
                  create: dto.payments.map((payment) => ({
                    method: toDbPaymentMethod(payment.method),
                    amount: payment.amount,
                    reference: payment.reference,
                    methodConfigId: payment.methodConfigId,
                    methodSnapshotName: payment.methodSnapshotName,
                    methodType: payment.methodType,
                    currency: payment.currency,
                    originalAmount: payment.originalAmount,
                    exchangeRate: payment.exchangeRate,
                    commissionRate: payment.commissionRate,
                    commissionAmount: payment.commissionAmount,
                    cashierId:
                      payment.cashierId ?? cashierId ?? order.cashierId,
                    cashierSnapshotName:
                      payment.cashierSnapshotName ??
                      cashierSnapshotName ??
                      order.cashierSnapshotName,
                  })),
                },
              }
            : {}),
          customerId: dto.customerId ?? undefined,
          cashierId: cashierId ?? undefined,
          cashierSnapshotName: cashierSnapshotName ?? undefined,
          customerSnapshotName: dto.customerSnapshotName ?? undefined,
          customerAddress: dto.customerAddress ?? undefined,
          orderType: dto.orderType ? toDbOrderType(dto.orderType) : undefined,
          total: totals.total,
          subTotal: totals.subTotal,
          discountAmount: totals.discountAmount,
          taxAmount: totals.taxAmount,
          cuponId,
          discountId,
          happyHourId,
          couponConsumptionRecorded: cuponId !== null && !skipCouponConsumption,
        },
      });
      return;
    }

    const now = new Date();
    if (cuponId !== null && !skipCouponConsumption) {
      await this.consumeCoupon(tx, cuponId, now);
    }
    await this.consumeCertificates(tx, certificateSerials, orderId, now);

    const shiftId = await this.requireActiveShiftId(tx);

    const lockedRows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Correlativo"
      WHERE "documentType" = 'FACTURA' AND "status" = 'ACTIVO'
      LIMIT 1
      FOR UPDATE
    `;

    let correlativoId = lockedRows[0]?.id;
    if (!correlativoId) {
      const prefix = this.buildMonthlyPrefix(now);
      const dgiConfigRecord = await tx.appConfig.findUnique({
        where: { id: 'dgi_resolution' },
      });
      const dgiConfig = readDgiConfig(dgiConfigRecord?.data ?? null);
      const expirationDate = getBusinessMonthEnd(now);

      const startNumber = Math.max(1, Number(dgiConfig.startNumber ?? 1));
      const endNumber = Math.max(
        startNumber,
        Number(dgiConfig.endNumber ?? 99999),
      );

      const created = await tx.correlativo.create({
        data: {
          documentType: DocumentType.FACTURA,
          resolutionNumber:
            dgiConfig.resolutionNumber ?? `AUTO-${prefix.slice(0, -1)}`,
          prefix,
          startNumber,
          endNumber,
          currentNumber: startNumber,
          issueDate: now,
          expirationDate,
          status: CorrelativoStatus.ACTIVO,
        },
      });
      correlativoId = created.id;
    }

    let correlativo = await tx.correlativo.findUnique({
      where: { id: correlativoId },
    });
    if (!correlativo) {
      throw new NotFoundException('No se pudo obtener el correlativo activo');
    }

    if (
      correlativo.expirationDate instanceof Date &&
      correlativo.expirationDate < now
    ) {
      await tx.correlativo.update({
        where: { id: correlativo.id },
        data: { status: CorrelativoStatus.VENCIDO },
      });
      if (/^AUTO-/i.test(correlativo.resolutionNumber ?? '')) {
        correlativo = await this.createDefaultCorrelativo(tx, now);
      } else {
        throw new BadRequestException('El correlativo está VENCIDO');
      }
    }

    const issuedNumber = correlativo.currentNumber;
    if (
      typeof correlativo.startNumber === 'number' &&
      issuedNumber < correlativo.startNumber
    ) {
      throw new BadRequestException(
        'El número actual del correlativo es menor al rango autorizado.',
      );
    }
    if (issuedNumber > correlativo.endNumber) {
      await tx.correlativo.update({
        where: { id: correlativo.id },
        data: { status: CorrelativoStatus.AGOTADO },
      });
      throw new BadRequestException('El correlativo está AGOTADO');
    }

    const dynamicPrefix = this.buildMonthlyPrefix(now);
    const cleanUserPrefix = (correlativo.prefix ?? '').replace(
      /^[a-z]{3}\d{2}-/i,
      '',
    );
    const width = String(correlativo.endNumber).length;
    const paddedNumber = String(issuedNumber).padStart(width, '0');
    const invoiceNumber = `${dynamicPrefix}${cleanUserPrefix}${paddedNumber}`;
    const nextNumber = issuedNumber + 1;
    const nextStatus =
      nextNumber > correlativo.endNumber
        ? CorrelativoStatus.AGOTADO
        : correlativo.status;

    await tx.correlativo.update({
      where: { id: correlativo.id },
      data: {
        currentNumber: nextNumber,
        status: nextStatus,
      },
    });

    await tx.order.update({
      where: { id: orderId },
      data: {
        status,
        ...(dto.payments !== undefined
          ? {
              payments: {
                deleteMany: {},
                create: dto.payments.map((payment) => ({
                  method: toDbPaymentMethod(payment.method),
                  amount: payment.amount,
                  reference: payment.reference,
                  methodConfigId: payment.methodConfigId,
                  methodSnapshotName: payment.methodSnapshotName,
                  methodType: payment.methodType,
                  currency: payment.currency,
                  originalAmount: payment.originalAmount,
                  exchangeRate: payment.exchangeRate,
                  commissionRate: payment.commissionRate,
                  commissionAmount: payment.commissionAmount,
                  cashierId: payment.cashierId ?? cashierId ?? order.cashierId,
                  cashierSnapshotName:
                    payment.cashierSnapshotName ??
                    cashierSnapshotName ??
                    order.cashierSnapshotName,
                })),
              },
            }
          : {}),
        customerId: dto.customerId ?? undefined,
        cashierId: cashierId ?? undefined,
        cashierSnapshotName: cashierSnapshotName ?? undefined,
        customerSnapshotName: dto.customerSnapshotName ?? undefined,
        customerAddress: dto.customerAddress ?? undefined,
        orderType: dto.orderType ? toDbOrderType(dto.orderType) : undefined,
        total: totals.total,
        subTotal: totals.subTotal,
        discountAmount: totals.discountAmount,
        taxAmount: totals.taxAmount,
        cuponId,
        discountId,
        happyHourId,
        couponConsumptionRecorded: cuponId !== null && !skipCouponConsumption,
        shiftId,
        paidAt: now,
        pendingCertificateSerials: Prisma.DbNull,
        invoiceCorrelativoId: correlativo.id,
        invoiceDocumentType: DocumentType.FACTURA,
        invoiceResolutionNumber: correlativo.resolutionNumber,
        invoicePrefix: correlativo.prefix ?? '',
        invoiceIssuedNumber: issuedNumber,
        invoiceNumber,
        invoiceIssuedAt: now,
      },
    });

    await tx.systemLog.create({
      data: {
        userId: order.cashierId,
        user: order.cashierSnapshotName ?? 'system',
        action: 'ORDER_FINALIZED',
        details: JSON.stringify({
          orderId: order.id,
          invoiceNumber,
          issuedNumber,
          correlativoId: correlativo.id,
          resolutionNumber: correlativo.resolutionNumber,
          payments: dto.payments,
          finalTotal: totals.total,
          taxAmount: totals.taxAmount,
          cuponId,
          discountId,
          happyHourId,
          promotionSource: promotion.source,
          promotionCode:
            promotion.source === 'coupon' ? promotion.promotionCode : undefined,
          certificateSerials,
        }),
        level: LogLevel.INFO,
      },
    });
  }

  private async synchronizeBilledItemPrices(
    tx: Prisma.TransactionClient,
    items?: readonly CartItemEntity[],
  ): Promise<void> {
    if (!items?.length || !tx.orderItem?.update) {
      return;
    }
    for (const item of items) {
      if (typeof item.id === 'number' && Number.isFinite(item.price)) {
        await tx.orderItem.update({
          where: { id: item.id },
          data: { price: item.price },
        });
      }
    }
  }

  private async requireActiveShiftId(
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    const activeShift = await tx.shift.findFirst({
      where: { status: ShiftStatus.OPEN },
      select: { id: true },
      orderBy: { startTime: 'desc' },
    });
    if (!activeShift) {
      throw new BadRequestException(
        'Debe existir un turno de caja abierto para cobrar una orden.',
      );
    }
    if (typeof tx.$executeRaw === 'function') {
      const lockedCount = await tx.$executeRaw`
        SELECT id
        FROM "Shift"
        WHERE id = ${activeShift.id} AND status = 'OPEN'::"ShiftStatus"
        FOR UPDATE
      `;
      if (typeof lockedCount === 'number' && lockedCount === 0) {
        throw new BadRequestException(
          'El turno de caja fue cerrado mientras se procesaba el cobro.',
        );
      }
    }
    return activeShift.id;
  }

  private async consumeCoupon(
    tx: Prisma.TransactionClient,
    cuponId: number,
    now: Date,
  ): Promise<void> {
    const rows = await tx.$queryRaw<LockedCoupon[]>`
      SELECT id, "manualStatus", "maxUses", "currentUses", "expiresDate", "deletedAt"
      FROM "Cupon"
      WHERE id = ${cuponId}
      FOR UPDATE
    `;
    const coupon = rows[0];

    if (!coupon || coupon.deletedAt) {
      throw new BadRequestException('Cupón no encontrado');
    }
    if (coupon.manualStatus !== CuponManualStatus.ACTIVO) {
      throw new BadRequestException('El cupón no está activo');
    }
    if (isCouponExpired(coupon.expiresDate, now)) {
      throw new BadRequestException('El cupón está vencido');
    }
    if (coupon.maxUses > 0 && coupon.currentUses >= coupon.maxUses) {
      throw new BadRequestException('El cupón agotó su cantidad de usos');
    }

    await tx.cupon.update({
      where: { id: cuponId },
      data: { currentUses: { increment: 1 } },
    });
  }

  private async consumeCertificates(
    tx: Prisma.TransactionClient,
    serials: readonly string[],
    orderId: string,
    now: Date,
  ): Promise<void> {
    const giftedItems = tx.orderItem?.findMany
      ? await tx.orderItem.findMany({
          where: { orderId, giftQuantity: { gt: 0 } },
          select: {
            productId: true,
            name: true,
            note: true,
            giftQuantity: true,
            giftReason: true,
            price: true,
          },
        })
      : [];

    const certificateGiftedItems = giftedItems.filter(
      (item) => item.giftReason !== 'happy-hour-2x1',
    );
    const itemSerials: string[] = [];
    for (const item of certificateGiftedItems) {
      const itemSerial = extractCertificateSerialFromNote(item.note);
      if (!itemSerial) {
        throw new BadRequestException(
          `Las unidades regaladas de ${item.name} requieren una promoción o certificado válido`,
        );
      }
      itemSerials.push(itemSerial);
    }

    const normalizedSerials = Array.from(
      new Set(
        [...serials, ...itemSerials]
          .map((serial) => serial.trim().toUpperCase())
          .filter((serial) => serial.length > 0),
      ),
    ).sort();

    for (const serial of normalizedSerials) {
      const rows = await tx.$queryRaw<LockedCertificate[]>`
        SELECT id, status, "deletedAt"
        FROM "Certificado"
        WHERE serial = ${serial}
        FOR UPDATE
      `;
      const certificate = rows[0];

      if (!certificate || certificate.deletedAt) {
        throw new BadRequestException(`Certificado no encontrado: ${serial}`);
      }
      if (certificate.status !== CertificadoStatus.DISPONIBLE) {
        throw new BadRequestException(
          `El certificado ${serial} no está disponible`,
        );
      }

      const details = await tx.certificado.findUnique({
        where: { id: certificate.id },
        select: {
          amount: true,
          items: { select: { productId: true, quantity: true } },
        },
      });
      const taggedItems = certificateGiftedItems.filter(
        (item) => extractCertificateSerialFromNote(item.note) === serial,
      );
      if (taggedItems.length === 0) {
        throw new BadRequestException(
          `El certificado ${serial} no está asociado a productos regalados`,
        );
      }

      if (!details?.items?.length && !details?.amount) {
        throw new BadRequestException(
          `El certificado ${serial} no tiene productos ni monto autorizado`,
        );
      }

      if (details?.items.length) {
        const authorized = new Map(
          details.items.map((item) => [item.productId, item.quantity]),
        );
        const redeemed = new Map<string, number>();
        for (const item of taggedItems) {
          if (!item.productId || !authorized.has(item.productId)) {
            throw new BadRequestException(
              `El certificado ${serial} no autoriza el producto ${item.name}`,
            );
          }
          redeemed.set(
            item.productId,
            (redeemed.get(item.productId) ?? 0) + item.giftQuantity,
          );
        }
        for (const [productId, quantity] of authorized) {
          if ((redeemed.get(productId) ?? 0) !== quantity) {
            throw new BadRequestException(
              `Las cantidades canjeadas no coinciden con el certificado ${serial}`,
            );
          }
        }
      }

      if (details?.amount) {
        const redeemedAmount = taggedItems.reduce(
          (sum, item) => sum + item.price.toNumber() * item.giftQuantity,
          0,
        );
        if (redeemedAmount - details.amount.toNumber() > 0.01) {
          throw new BadRequestException(
            `El valor canjeado supera el monto del certificado ${serial}`,
          );
        }
      }

      await tx.certificado.update({
        where: { id: certificate.id },
        data: {
          status: CertificadoStatus.ENTREGADO,
          redeemedAt: now,
          redeemedOrderId: orderId,
        },
      });
    }
  }

  private async createDefaultCorrelativo(
    tx: Prisma.TransactionClient,
    now: Date,
  ) {
    const prefix = this.buildMonthlyPrefix(now);
    const dgiConfigRecord = await tx.appConfig.findUnique({
      where: { id: 'dgi_resolution' },
    });
    const dgiConfig = readDgiConfig(dgiConfigRecord?.data ?? null);
    const expirationDate = getBusinessMonthEnd(now);

    const startNumber = Math.max(1, Number(dgiConfig.startNumber ?? 1));
    const endNumber = Math.max(
      startNumber,
      Number(dgiConfig.endNumber ?? 99999),
    );

    return tx.correlativo.create({
      data: {
        documentType: DocumentType.FACTURA,
        resolutionNumber:
          dgiConfig.resolutionNumber ?? `AUTO-${prefix.slice(0, -1)}`,
        prefix,
        startNumber,
        endNumber,
        currentNumber: startNumber,
        issueDate: now,
        expirationDate,
        status: CorrelativoStatus.ACTIVO,
      },
    });
  }

  private buildMonthlyPrefix(date: Date): string {
    const monthNames = [
      'ENE',
      'FEB',
      'MAR',
      'ABR',
      'MAY',
      'JUN',
      'JUL',
      'AGO',
      'SEP',
      'OCT',
      'NOV',
      'DIC',
    ];
    const { year, month } = getBusinessDateParts(date);
    return `${monthNames[month - 1]}${String(year).slice(-2)}-`;
  }
}
