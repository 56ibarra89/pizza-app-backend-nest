import {
  BadRequestException,
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
import { OrderStatusDto } from '../dto/order-status.dto';
import {
  toDbOrderStatus,
  toDbOrderType,
  toDbPaymentMethod,
} from '../mappers/status.mapper';
import type { OrderTotals } from '../types/order-totals';

interface IssueInvoiceParams {
  orderId: string;
  dto: FinalizeOrderDto;
  totals: OrderTotals;
  cuponId?: number;
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
    { orderId, dto, totals, cuponId }: IssueInvoiceParams,
  ): Promise<void> {
    const lockedOrders = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM "Order"
      WHERE id = ${orderId}
      FOR UPDATE
    `;
    if (!lockedOrders[0]) {
      throw new NotFoundException('Orden no encontrada');
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
      },
    });

    if (!order) throw new NotFoundException('Orden no encontrada');
    if (order.status === 'PAID') return;

    const status = toDbOrderStatus(OrderStatusDto.paid);
    if (order.invoiceNumber) {
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
                  })),
                },
              }
            : {}),
          customerSnapshotName: dto.customerSnapshotName ?? undefined,
          customerAddress: dto.customerAddress ?? undefined,
          orderType: dto.orderType ? toDbOrderType(dto.orderType) : undefined,
          total: totals.total,
          subTotal: totals.subTotal,
          discountAmount: totals.discountAmount,
          taxAmount: totals.taxAmount,
          cuponId,
        },
      });
      return;
    }

    const now = new Date();
    if (cuponId !== undefined) {
      await this.consumeCoupon(tx, cuponId, now);
    }
    await this.consumeCertificates(
      tx,
      dto.certificateSerials ?? [],
      orderId,
      now,
    );

    const shiftId =
      order.shiftId ??
      (
        await tx.shift.findFirst({
          where: { status: ShiftStatus.OPEN },
          select: { id: true },
          orderBy: { startTime: 'desc' },
        })
      )?.id;

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
      const expirationDate = new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        0,
        23,
        59,
        59,
      );

      const created = await tx.correlativo.create({
        data: {
          documentType: DocumentType.FACTURA,
          resolutionNumber:
            dgiConfig.resolutionNumber ?? `AUTO-${prefix.slice(0, -1)}`,
          prefix,
          startNumber: Number(dgiConfig.startNumber ?? 1),
          endNumber: Number(dgiConfig.endNumber ?? 99999),
          currentNumber: 1,
          issueDate: now,
          expirationDate,
          status: CorrelativoStatus.ACTIVO,
        },
      });
      correlativoId = created.id;
    }

    const correlativo = await tx.correlativo.findUnique({
      where: { id: correlativoId },
    });
    if (!correlativo) {
      throw new NotFoundException('No se pudo obtener el correlativo activo');
    }

    const issuedNumber = correlativo.currentNumber;
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
                })),
              },
            }
          : {}),
        customerSnapshotName: dto.customerSnapshotName ?? undefined,
        customerAddress: dto.customerAddress ?? undefined,
        orderType: dto.orderType ? toDbOrderType(dto.orderType) : undefined,
        total: totals.total,
        subTotal: totals.subTotal,
        discountAmount: totals.discountAmount,
        taxAmount: totals.taxAmount,
        cuponId,
        shiftId: shiftId ?? null,
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
          promotionCode: dto.promotionCode,
          certificateSerials: dto.certificateSerials,
        }),
        level: LogLevel.INFO,
      },
    });
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
    if (coupon.expiresDate && coupon.expiresDate < now) {
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
    const normalizedSerials = Array.from(
      new Set(
        serials
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
    return `${monthNames[date.getMonth()]}${String(date.getFullYear()).slice(-2)}-`;
  }
}
