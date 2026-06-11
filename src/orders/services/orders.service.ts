import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ORDERS_REPOSITORY,
  type IOrdersRepository,
} from '../interfaces/orders.repository';
import type { CreateOrderDto } from '../dto/create-order.dto';
import type { UpdateOrderStatusDto } from '../dto/update-order-status.dto';
import type { UpdateOrderItemsDto } from '../dto/update-order-items.dto';
import type { FinalizeOrderDto } from '../dto/finalize-order.dto';
import { OrderStatusDto } from '../dto/order-status.dto';
import { KitchenStatusDto } from '../dto/kitchen-status.dto';
import type { CartItemEntity } from '../entities/order-item.entity';
import { CorrelativoStatus, DocumentType, LogLevel, ShiftStatus } from '@prisma/client';
import { toDbOrderType, toDbPaymentMethod } from '../mappers/status.mapper';
import { PaymentMethodDto } from '../dto/payment-method.dto';

@Injectable()
export class OrdersService {
  constructor(
    @Inject(ORDERS_REPOSITORY) private readonly repo: IOrdersRepository,
    private readonly prisma: PrismaService,
  ) {}

  listTodayOrActive(now = new Date()) {
    return this.repo.listTodayOrActive(now);
  }

  listAll() {
    return this.repo.listAll();
  }

  listByDateRange(startDate: Date, endDate: Date) {
    return this.repo.listByDateRange(startDate, endDate);
  }

  async getById(id: string) {
    const found = await this.repo.findById(id);
    if (!found) throw new NotFoundException('Orden no encontrada');
    return found;
  }

  async create(dto: CreateOrderDto) {
    const status = dto.status ?? (dto.payments?.length ? OrderStatusDto.paid : OrderStatusDto.pending);
    const timestamp = dto.timestamp ?? new Date();
    const isSentToKitchen = dto.isSentToKitchen ?? !(dto.linkedTables && dto.linkedTables.length > 0);

    const customerId = dto.customerId ?? (await this.tryResolveCustomerId(dto.customerSnapshotName));
    const cashierId = dto.cashierId ?? (await this.tryResolveCashierId(dto.cashierSnapshotName));
    const shiftId = dto.shiftId ?? (await this.tryResolveActiveShiftId());

    const created = await this.repo.create({
      id: dto.id,
      shiftId,
      customerId,
      items: dto.items.map(item => ({ ...item, giftQuantity: item.giftQuantity ?? 0 })),
      subTotal: dto.subTotal,
      discountAmount: dto.discountAmount,
      taxAmount: dto.taxAmount,
      total: dto.total,
      status: status === OrderStatusDto.paid ? OrderStatusDto.pending : status,
      timestamp,
      customerSnapshotName: dto.customerSnapshotName,
      customerAddress: dto.customerAddress,
      orderType: dto.orderType,
      cuponId: dto.cuponId,
      payments: status === OrderStatusDto.paid ? undefined : dto.payments,
      cashierId,
      cashierSnapshotName: dto.cashierSnapshotName,
      driverId: dto.driverId,
      isSentToKitchen,
      linkedTables: dto.linkedTables,
    });

    if (status === OrderStatusDto.paid) {
      return this.finalize(created.id, {
        payments: dto.payments,
        customerSnapshotName: dto.customerSnapshotName,
        customerAddress: dto.customerAddress,
        orderType: dto.orderType,
        subTotal: dto.subTotal,
        taxAmount: dto.taxAmount,
        discountAmount: dto.discountAmount,
        finalTotal: dto.total,
        cuponId: dto.cuponId,
      });
    }

    return created;
  }

  private validatePaymentsSum(expectedTotal: number, payments: { amount: number }[]) {
    const sum = payments.reduce((acc, p) => acc + p.amount, 0);
    // Usar epsilon pequeño para evitar errores de precisión flotante en JS
    if (Math.abs(sum - expectedTotal) > 0.01) {
      throw new BadRequestException(`La suma de los pagos (${sum.toFixed(2)}) no coincide con el total de la orden (${expectedTotal.toFixed(2)}). No se puede marcar como pagada.`);
    }
  }

  private async tryResolveActiveShiftId(): Promise<string | undefined> {
    const active = await this.prisma.shift.findFirst({
      where: { status: 'OPEN' },
      select: { id: true },
      orderBy: { startTime: 'desc' },
    });
    return active?.id;
  }

  private async tryResolveCustomerId(customerName?: string): Promise<string | undefined> {
    if (!customerName) return undefined;
    const trimmedName = customerName.trim();
    if (!trimmedName) return undefined;

    const found = await this.prisma.customer.findFirst({
      where: { name: { equals: customerName.trim(), mode: 'insensitive' } },
      select: { id: true },
    });
    return found?.id;
  }

  private async tryResolveCashierId(cashierName?: string): Promise<string | undefined> {
    if (!cashierName) return undefined;
    const username = cashierName.trim();
    if (!username) return undefined;

    const direct = await this.prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });
    if (direct) return direct.id;

    const lowered = username.toLowerCase();
    if (lowered !== username) {
      const alt = await this.prisma.user.findUnique({
        where: { username: lowered },
        select: { id: true },
      });
      return alt?.id;
    }

    return undefined;
  }

  async updateStatus(id: string, dto: UpdateOrderStatusDto, user?: any) {
    const existing = await this.getById(id);
    const isFinal = existing.status === OrderStatusDto.paid || existing.status === OrderStatusDto.cancelled;

    // Regla de Negocio: El COCINERO no puede cambiar estados financieros
    if (user?.role === 'cocinero') {
      if (dto.status === OrderStatusDto.paid || dto.status === OrderStatusDto.cancelled) {
        throw new ForbiddenException('Los cocineros no tienen permiso para cobrar o cancelar órdenes.');
      }
    }

    if (dto.status === OrderStatusDto.cancelled) {
      if (!dto.adminPin) {
        throw new ForbiddenException('Se requiere un PIN de administrador para cancelar la orden.');
      }
      
      const adminUser = await this.prisma.user.findFirst({
        where: { pin: dto.adminPin, role: 'ADMIN', isActive: true },
      });
      
      if (!adminUser) {
        throw new ForbiddenException('PIN de administrador inválido o usuario no tiene permisos.');
      }
    }

    if (dto.sentAt) {
      if (dto.status === OrderStatusDto.paid || dto.status === OrderStatusDto.cancelled) {
        throw new BadRequestException('Status inválido para cocina');
      }

      await this.repo.updateItemsKitchenStatus({
        orderId: id,
        sentAt: new Date(dto.sentAt),
        kitchenStatus: dto.status as unknown as KitchenStatusDto,
      });

      const reloaded = await this.getById(id);
      if (isFinal) return reloaded;

      const derived = this.deriveGlobalStatus(reloaded.items);
      return this.repo.update(id, { status: derived });
    }

    if (isFinal) {
      // Permitir que las órdenes ya pagadas puedan ser anuladas
      if (existing.status === OrderStatusDto.paid && dto.status === OrderStatusDto.cancelled) {
        // Continuar con la anulación
      } else {
        return existing;
      }
    }

    const nextStatus = dto.status;
    if (nextStatus === OrderStatusDto.paid) {
      this.validatePaymentsSum(existing.total, existing.payments);
    }

    const updateItemsKitchen = this.asKitchenStatusOrUndefined(nextStatus);

    const items = updateItemsKitchen
      ? existing.items.map((i) => ({ ...i, kitchenStatus: updateItemsKitchen }))
      : existing.items;

    const updateData: Parameters<IOrdersRepository['update']>[1] = { status: nextStatus, items };

    if (nextStatus === OrderStatusDto.cancelled) {
      updateData.cancelReason = dto.cancelReason;
      updateData.cancelledById = dto.cancelledById;
      updateData.cancelledAt = new Date();
    }

    return this.repo.update(id, updateData);
  }

  async updateTables(id: string, tableIds: string[]) {
    await this.prisma.$transaction(async (tx) => {
      // Clear existing links
      await tx.orderTable.deleteMany({
        where: { orderId: id },
      });

      // Create new links
      if (tableIds && tableIds.length > 0) {
        await tx.orderTable.createMany({
          data: tableIds.map((tId) => ({
            orderId: id,
            tableId: tId,
          })),
        });
      }
    });

    return this.getById(id);
  }

  async updateItems(id: string, dto: UpdateOrderItemsDto, user?: any) {
    const existing = await this.getById(id);
    const isFinal = existing.status === OrderStatusDto.paid || existing.status === OrderStatusDto.cancelled;

    const mappedItems = dto.items.map(item => ({ ...item, giftQuantity: item.giftQuantity ?? 0 }));
    const nextStatus = isFinal ? existing.status : this.deriveGlobalStatus(mappedItems as any);

    return this.repo.update(id, {
      items: mappedItems as any,
      total: dto.total,
      subTotal: dto.subTotal === undefined ? undefined : dto.subTotal,
      discountAmount: dto.discountAmount === undefined ? undefined : dto.discountAmount,
      taxAmount: dto.taxAmount === undefined ? undefined : dto.taxAmount,
      cuponId: dto.cuponId === undefined ? undefined : dto.cuponId,
      status: nextStatus,
      isSentToKitchen: dto.isSentToKitchen,
    });
  }

  async finalize(id: string, dto: FinalizeOrderDto, user?: any) {
    if (user?.role === 'cocinero') {
      throw new ForbiddenException('Los cocineros no pueden facturar órdenes.');
    }
    const existing = await this.getById(id);
    if (existing.status === OrderStatusDto.paid) return existing;

    const finalTotal = dto.finalTotal ?? existing.total;
    const finalPayments = dto.payments ?? existing.payments;
    this.validatePaymentsSum(finalTotal, finalPayments);

    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id },
        select: {
          id: true,
          status: true,
          total: true,
          cashierId: true,
          cashierSnapshotName: true,
          shiftId: true,
          invoiceNumber: true,
        },
      });

      if (!order) throw new NotFoundException('Orden no encontrada');
      if (order.status === 'PAID') return;
      if (order.invoiceNumber) {
        // Ya tiene factura asignada: hacemos finalize idempotente sin consumir otro correlativo
        await tx.order.update({
          where: { id },
          data: {
            status: 'PAID',
            ...(dto.payments !== undefined ? {
              payments: {
                deleteMany: {},
                create: dto.payments.map(p => ({ method: toDbPaymentMethod(p.method), amount: p.amount })),
              }
            } : {}),
            customerSnapshotName: dto.customerSnapshotName ?? undefined,
            customerAddress: dto.customerAddress ?? undefined,
            orderType: dto.orderType ? toDbOrderType(dto.orderType) : undefined,
            total: finalTotal,
            subTotal: dto.subTotal === undefined ? undefined : dto.subTotal,
            discountAmount: dto.discountAmount === undefined ? undefined : dto.discountAmount,
            taxAmount: dto.taxAmount === undefined ? undefined : dto.taxAmount,
            cuponId: dto.cuponId === undefined ? undefined : dto.cuponId,
          },
        });
        return;
      }

      // Resolver shift activo si no lo trae (como fallback defensivo)
      const shiftId = order.shiftId
        ? order.shiftId
        : (
            await tx.shift.findFirst({
              where: { status: ShiftStatus.OPEN },
              select: { id: true },
              orderBy: { startTime: 'desc' },
            })
          )?.id;

      const now = new Date();

      let lockedRows = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Correlativo"
        WHERE "documentType" = 'FACTURA' AND "status" = 'ACTIVO'
        LIMIT 1
        FOR UPDATE
      `;

      let correlativoId = lockedRows[0]?.id;

      if (!correlativoId) {
        const monthNames = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
        const monthStr = monthNames[now.getMonth()];
        const yearStr = String(now.getFullYear()).slice(-2);
        const autoPrefix = `${monthStr}${yearStr}-`;

        const dgiConfig = await tx.appConfig.findUnique({ where: { id: 'dgi_resolution' } });
        const dgiData = dgiConfig?.data as any;

        const expirationDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        const resNumber = dgiData?.resolutionNumber || `AUTO-${autoPrefix.slice(0, -1)}`;
        const startNum = dgiData?.startNumber ? Number(dgiData.startNumber) : 1;
        const endNum = dgiData?.endNumber ? Number(dgiData.endNumber) : 99999;

        const newCorr = await tx.correlativo.create({
          data: {
            documentType: DocumentType.FACTURA,
            resolutionNumber: resNumber,
            prefix: autoPrefix,
            startNumber: startNum,
            endNumber: endNum,
            currentNumber: 1,
            issueDate: now,
            expirationDate: expirationDate,
            status: CorrelativoStatus.ACTIVO,
          }
        });
        correlativoId = newCorr.id;
      }

      const correlativo = await tx.correlativo.findUnique({
        where: { id: correlativoId },
      });

      if (!correlativo) {
        return;
      }

      // La DGI no utiliza fecha de vencimiento, por lo que eliminamos la validación
      // que marcaba el correlativo como VENCIDO.

      const issuedNumber = correlativo.currentNumber;
      if (issuedNumber > correlativo.endNumber) {
        await tx.correlativo.update({
          where: { id: correlativo.id },
          data: { status: CorrelativoStatus.AGOTADO },
        });
        throw new BadRequestException('El correlativo está AGOTADO');
      }

      const monthNames = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
      const monthStr = monthNames[now.getMonth()];
      const yearStr = String(now.getFullYear()).slice(-2);
      const dynamicPrefix = `${monthStr}${yearStr}-`;

      const width = String(correlativo.endNumber).length;
      const padded = String(issuedNumber).padStart(width, '0');
      const invoiceNumber = `${dynamicPrefix}${correlativo.prefix ?? ''}${padded}`;

      const nextNumber = issuedNumber + 1;
      const nextStatus = nextNumber > correlativo.endNumber ? CorrelativoStatus.AGOTADO : correlativo.status;

      await tx.correlativo.update({
        where: { id: correlativo.id },
        data: {
          currentNumber: nextNumber,
          status: nextStatus,
        },
      });

      await tx.order.update({
        where: { id },
        data: {
          status: 'PAID',
          ...(dto.payments !== undefined ? {
            payments: {
              deleteMany: {},
              create: dto.payments.map(p => ({ method: toDbPaymentMethod(p.method), amount: p.amount })),
            }
          } : {}),
          customerSnapshotName: dto.customerSnapshotName ?? undefined,
          customerAddress: dto.customerAddress ?? undefined,
          orderType: dto.orderType ? toDbOrderType(dto.orderType) : undefined,
          total: finalTotal,
          subTotal: dto.subTotal === undefined ? undefined : dto.subTotal,
          discountAmount: dto.discountAmount === undefined ? undefined : dto.discountAmount,
          taxAmount: dto.taxAmount === undefined ? undefined : dto.taxAmount,
          cuponId: dto.cuponId === undefined ? undefined : dto.cuponId,
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

      const user = order.cashierSnapshotName ?? 'system';
      const details = JSON.stringify({
        orderId: order.id,
        invoiceNumber,
        issuedNumber,
        correlativoId: correlativo.id,
        resolutionNumber: correlativo.resolutionNumber,
        payments: dto.payments,
        finalTotal,
        taxAmount: dto.taxAmount,
        cuponId: dto.cuponId,
      });

      await tx.systemLog.create({
        data: {
          userId: order.cashierId,
          user,
          role: undefined,
          action: 'ORDER_FINALIZED',
          details,
          level: LogLevel.INFO,
        },
      });
    });

    return this.getById(id);
  }

  private deriveGlobalStatus(items: CartItemEntity[]): OrderStatusDto {
    if (items.length === 0) return OrderStatusDto.pending;

    const hasUnsent = items.some((i) => !i.isSentToKitchen);
    if (hasUnsent) return OrderStatusDto.pending;

    const anyPending = items.some((i) => i.kitchenStatus === KitchenStatusDto.pending);
    if (anyPending) return OrderStatusDto.pending;

    const anyPreparing = items.some((i) => i.kitchenStatus === KitchenStatusDto.preparing);
    if (anyPreparing) return OrderStatusDto.preparing;

    const allDelivered = items.every((i) => i.kitchenStatus === KitchenStatusDto.delivered);
    if (allDelivered) return OrderStatusDto.delivered;

    const anyReady = items.some((i) => i.kitchenStatus === KitchenStatusDto.ready);
    if (anyReady) return OrderStatusDto.ready;

    return OrderStatusDto.pending;
  }

  private asKitchenStatusOrUndefined(status: OrderStatusDto): KitchenStatusDto | undefined {
    switch (status) {
      case OrderStatusDto.pending:
        return KitchenStatusDto.pending;
      case OrderStatusDto.preparing:
        return KitchenStatusDto.preparing;
      case OrderStatusDto.ready:
        return KitchenStatusDto.ready;
      case OrderStatusDto.delivered:
        return KitchenStatusDto.delivered;
      default:
        return undefined;
    }
  }
}
