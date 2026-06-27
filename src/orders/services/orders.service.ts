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
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ProductsService } from '../../products/services/products.service';
import { AppConfigService } from '../../app-config/services/app-config.service';
import { PromotionsService } from '../../promotions/services/promotions.service';

@Injectable()
export class OrdersService {
  constructor(
    @Inject(ORDERS_REPOSITORY) private readonly repo: IOrdersRepository,
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly productsService: ProductsService,
    private readonly appConfigService: AppConfigService,
    private readonly promotionsService: PromotionsService,
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

  listByDriverAndDate(driverId: string, startDate: Date, endDate: Date) {
    return this.repo.listByDriverAndDate(driverId, startDate, endDate);
  }

  async getHiddenKitchenTickets(): Promise<string[]> {
    const hidden = await this.prisma.hiddenKitchenTicket.findMany({
      select: { ticketId: true },
    });
    return hidden.map(h => h.ticketId);
  }

  async addHiddenKitchenTickets(ticketIds: string[], user: any): Promise<void> {
    if (!ticketIds || ticketIds.length === 0) return;
    
    const data = ticketIds.map(ticketId => ({
      ticketId,
      hiddenBy: user?.username || 'unknown',
    }));

    await this.prisma.hiddenKitchenTicket.createMany({
      data,
      skipDuplicates: true,
    });
  }

  async getById(id: string) {
    const found = await this.repo.findById(id);
    if (!found) throw new NotFoundException('Orden no encontrada');
    return found;
  }

  async create(dto: CreateOrderDto) {
    const fs = require('fs');
    fs.appendFileSync('create_debug.log', new Date().toISOString() + ' --- INCOMING CREATE DTO ---\n' + JSON.stringify(dto, null, 2) + '\n');
    const status = dto.status ?? (dto.payments?.length ? OrderStatusDto.paid : OrderStatusDto.pending);
    const timestamp = dto.timestamp ?? new Date();
    const isSentToKitchen = dto.isSentToKitchen ?? !(dto.linkedTables && dto.linkedTables.length > 0);

    const customerId = dto.customerId ?? (await this.tryResolveCustomerId(dto.customerSnapshotName));
    const cashierId = dto.cashierId ?? (await this.tryResolveCashierId(dto.cashierSnapshotName));
    const shiftId = dto.shiftId ?? (await this.tryResolveActiveShiftId());

    try {
      const { subTotal, taxAmount, total, appliedDiscountAmount } = await this.calculateSecureTotals(dto.items, dto.cuponId, dto.discountAmount);
      fs.appendFileSync('create_debug.log', new Date().toISOString() + ' --- CALCULATED TOTALS ---\n' + JSON.stringify({ subTotal, taxAmount, total, appliedDiscountAmount }, null, 2) + '\n');

      const created = await this.repo.create({
        id: dto.id,
        shiftId,
        customerId,
        items: dto.items.map(item => ({ ...item, giftQuantity: item.giftQuantity ?? 0 })),
        subTotal: subTotal,
        discountAmount: appliedDiscountAmount,
        taxAmount: taxAmount,
        total: Math.max(0, total),
        timestamp,
        status: status === OrderStatusDto.paid ? OrderStatusDto.pending : status,
        customerSnapshotName: dto.customerSnapshotName,
        cashierId,
        cashierSnapshotName: dto.cashierSnapshotName,
        orderType: dto.orderType,
        customerAddress: dto.customerAddress,
        linkedTables: dto.linkedTables,
        isSentToKitchen,
        cuponId: dto.cuponId,
        driverId: dto.driverId,
        payments: status === OrderStatusDto.paid ? undefined : dto.payments,
        customerTendered: dto.customerTendered,
        deliveryChange: dto.deliveryChange,
      });

      if (status === OrderStatusDto.paid) {
        try {
          return await this.finalize(created.id, {
            payments: dto.payments,
            customerSnapshotName: dto.customerSnapshotName,
            customerAddress: dto.customerAddress,
            orderType: dto.orderType,
            subTotal: subTotal,
            taxAmount: taxAmount,
            discountAmount: appliedDiscountAmount,
            finalTotal: total,
            cuponId: dto.cuponId,
          }, 'system');
        } catch (error) {
          fs.appendFileSync('create_debug.log', new Date().toISOString() + ' --- FINALIZE ERROR ---\n' + error.stack + '\n');
          await this.prisma.order.delete({ where: { id: created.id } });
          throw error;
        }
      }

      return created;
    } catch (globalError) {
      fs.appendFileSync('create_debug.log', new Date().toISOString() + ' --- GLOBAL CREATE ERROR ---\n' + globalError.stack + '\n');
      throw globalError;
    }
  }

  private validatePaymentsSum(expectedTotal: number, payments: { amount: number }[]) {
    const sum = payments.reduce((acc, p) => acc + p.amount, 0);
    // Usar epsilon pequeño para evitar errores de precisión flotante en JS
    if (Math.abs(sum - expectedTotal) > 0.01) {
      throw new BadRequestException(`La suma de los pagos (${sum.toFixed(2)}) no coincide con el total de la orden (${expectedTotal.toFixed(2)}). No se puede marcar como pagada.`);
    }
  }

  private async calculateSecureTotals(
    items: any[],
    cuponId?: number,
    providedDiscountAmount?: number
  ): Promise<{ subTotal: number; taxAmount: number; total: number; appliedDiscountAmount: number }> {
    let calculatedSubTotal = 0;
    let discountableSubTotal = 0;

    const packagingConfig = await this.appConfigService.getByIdOrDefault('packaging_sizes');
    const packagingSizes = (packagingConfig?.data as any)?.sizes || [];

    for (const item of items) {
      let itemBasePrice = 0;
      let isDiscountable = true;

      if (item.productId) {
        try {
          const product = await this.productsService.getProductById(item.productId);
          const priceConfig = product.prices.find((p: any) => p.size.toLowerCase() === item.size.toLowerCase());
          itemBasePrice = priceConfig ? priceConfig.price : item.price;

          let extrasTotal = 0;
          if (item.extras && product.extras) {
            for (const extra of item.extras) {
              const extraConfig = product.extras.find((e: any) => e.name.toLowerCase() === extra.name.toLowerCase());
              if (extraConfig) {
                const extraPriceConfig = extraConfig.prices.find((p: any) => p.size.toLowerCase() === item.size.toLowerCase());
                if (extraPriceConfig) extrasTotal += extraPriceConfig.price;
              }
            }
          }
          itemBasePrice += extrasTotal;
        } catch {
          itemBasePrice = item.price;
        }
      } else if (item.name && item.name.toLowerCase().startsWith('empaque')) {
        const packName = item.name.replace(/empaque\s+/i, '').trim();
        const packConfig = packagingSizes.find((s: any) => s.name.toLowerCase() === packName.toLowerCase());
        itemBasePrice = packConfig ? packConfig.price : item.price;
        isDiscountable = false;
      } else if (item.name && item.name.toLowerCase() === 'delivery') {
        itemBasePrice = item.price;
        isDiscountable = false;
      } else {
        itemBasePrice = item.price;
      }

      const billableQty = Math.max(0, item.quantity - (item.giftQuantity || 0));
      const itemTotal = itemBasePrice * billableQty;
      calculatedSubTotal += itemTotal;
      if (isDiscountable) discountableSubTotal += itemTotal;
    }

    const taxConfig = await this.appConfigService.getByIdOrDefault('app_factura_tax_config');
    let taxData = taxConfig?.data as any;
    
    // Apply the same default tax configuration as the frontend if no data exists
    if (!taxData || Object.keys(taxData).length === 0) {
      taxData = {
        taxes: [{ id: '1', name: 'Módulo Principal de ITBMS/IVA', percentage: 15 }],
        isExonerated: false
      };
    }

    const isExonerated = taxData.isExonerated || false;
    let taxPercentage = 0;
    if (!isExonerated) {
      const taxes = taxData.taxes || [];
      if (taxes.length > 0) {
        taxPercentage = taxes[0].percentage || 0;
      }
    }
    const taxesEnabled = taxPercentage > 0;    
    let appliedDiscountAmount = providedDiscountAmount || 0;
    if (cuponId) {
      const cupon = await this.promotionsService.getCuponById(cuponId);
      // Validar cupón
      if (cupon && cupon.status === 'Activo' && (!cupon.maxUses || cupon.currentUses < cupon.maxUses)) {
        if (cupon.discountType === 'porcentaje') {
          appliedDiscountAmount = discountableSubTotal * (cupon.discountValue / 100);
        } else {
          appliedDiscountAmount = cupon.discountValue;
        }
        appliedDiscountAmount = Math.min(appliedDiscountAmount, calculatedSubTotal);
      }
    }

    const calculatedSubTotalAfterDiscount = calculatedSubTotal - appliedDiscountAmount;

    let calculatedTax = 0;
    if (taxesEnabled && taxPercentage > 0) {
      calculatedTax = calculatedSubTotalAfterDiscount * (taxPercentage / 100);
    }

    const finalTotal = calculatedSubTotalAfterDiscount + calculatedTax;

    return {
      subTotal: calculatedSubTotal,
      taxAmount: calculatedTax,
      total: Math.max(0, finalTotal),
      appliedDiscountAmount,
    };
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

    let authorizerAdmin: any = null;
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
      dto.cancelledById = adminUser.id;
      authorizerAdmin = adminUser;
    }
    console.log(`[updateStatus] START id=${id}, dto.status=${dto.status}, dto.sentAt=${dto.sentAt}, existing.status=${existing.status}, isFinal=${isFinal}`);

    if (dto.sentAt) {
      console.log(`[updateStatus] Entrando al bloque de dto.sentAt con valor: ${dto.sentAt}`);
      if (dto.status === OrderStatusDto.paid || dto.status === OrderStatusDto.cancelled) {
        throw new BadRequestException('Status inválido para cocina');
      }

      await this.repo.updateItemsKitchenStatus({
        orderId: id,
        sentAt: new Date(dto.sentAt),
        kitchenStatus: dto.status as unknown as KitchenStatusDto,
      });

      const reloaded = await this.getById(id);

      if (dto.status === OrderStatusDto.delivered) {
        // Find which table is assigned to this order, if any
        const tableName = reloaded.linkedTables?.[0] || undefined;
        const customerName = reloaded.customerSnapshotName || undefined;
        const orderType = reloaded.orderType || undefined;
        this.eventEmitter.emit('order.ready', {
          orderId: id,
          isFullOrder: true,
          tableName,
          customerName,
          orderType,
        });
      }

      const derived = this.deriveGlobalStatus(reloaded.items);
      const nextGlobalStatus = (existing.status === OrderStatusDto.paid || existing.status === OrderStatusDto.cancelled) 
                               ? existing.status 
                               : derived;
      console.log(`[updateStatus] Bloque dto.sentAt terminado. derives global status: ${nextGlobalStatus}`);
      return this.repo.update(id, { status: nextGlobalStatus });
    }

    if (isFinal) {
      console.log(`[updateStatus] Entrando al bloque isFinal`);
      // Permitir que las órdenes ya pagadas puedan ser anuladas o actualizadas por la cocina
      if (
        existing.status === OrderStatusDto.paid &&
        (dto.status === OrderStatusDto.cancelled ||
          dto.status === OrderStatusDto.preparing ||
          dto.status === OrderStatusDto.ready ||
          dto.status === OrderStatusDto.delivered)
      ) {
        console.log(`[updateStatus] Permitiendo actualización de status de cocina en orden pagada`);
        // Continuar
      } else {
        console.log(`[updateStatus] Retornando existing sin modificar porque no cumple validación de cocina.`);
        return existing;
      }
    }

    const nextStatus = dto.status;
    if (nextStatus === OrderStatusDto.paid && existing.status !== OrderStatusDto.paid) {
      this.validatePaymentsSum(existing.total, existing.payments);
    }

    const updateItemsKitchen = this.asKitchenStatusOrUndefined(nextStatus);
    console.log(`[updateStatus] Actualizando items a kitchenStatus: ${updateItemsKitchen}`);

    const items = updateItemsKitchen
      ? existing.items.map((i) => ({ ...i, kitchenStatus: updateItemsKitchen }))
      : existing.items;

    const updateData: Parameters<IOrdersRepository['update']>[1] = { status: nextStatus, items };

    if (nextStatus === OrderStatusDto.delivered) {
      const tableName = existing.linkedTables?.[0] || undefined;
      const customerName = existing.customerSnapshotName || undefined;
      const orderType = existing.orderType || undefined;
      this.eventEmitter.emit('order.ready', {
        orderId: id,
        isFullOrder: true,
        tableName,
        customerName,
        orderType,
      });
    }

    if (nextStatus === OrderStatusDto.cancelled) {
      updateData.cancelReason = dto.cancelReason;
      updateData.cancelledById = dto.cancelledById;
      updateData.cancelledAt = new Date();

      // Send email to all admins
      const cashierName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : 'Desconocido';
      const adminName = authorizerAdmin ? `${authorizerAdmin.firstName || ''} ${authorizerAdmin.lastName || ''}`.trim() : 'Desconocido';
      const reasonStr = dto.cancelReason || 'No especificado';
      const invoiceNum = existing.invoice?.invoiceNumber ? `#${existing.invoice.invoiceNumber}` : 'Sin Factura';

      this.eventEmitter.emit('order.cancelled', {
        orderId: existing.id,
        invoiceNum,
        cashierName,
        adminName,
        reasonStr
      });
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

    // Detect items that changed to DELIVERED
    if (!isFinal) {
      for (let i = 0; i < mappedItems.length; i++) {
        const item = mappedItems[i];
        if (item.kitchenStatus === KitchenStatusDto.delivered) {
          const existingItem = existing.items[i];
          if (existingItem && existingItem.kitchenStatus !== KitchenStatusDto.delivered) {
            const tableName = existing.linkedTables?.[0] || undefined;
            const customerName = existing.customerSnapshotName || undefined;
            const orderType = existing.orderType || undefined;
            this.eventEmitter.emit('order.ready', {
              orderId: id,
              itemName: item.name,
              isFullOrder: false,
              tableName,
              customerName,
              orderType,
            });
          }
        }
      }
    }

    const { subTotal, taxAmount, total, appliedDiscountAmount } = await this.calculateSecureTotals(mappedItems, dto.cuponId, dto.discountAmount);

    return this.repo.update(id, {
      items: mappedItems as any,
      total: total,
      subTotal: subTotal,
      discountAmount: appliedDiscountAmount,
      taxAmount: taxAmount,
      cuponId: dto.cuponId,
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

    const cuponIdToUse = dto.cuponId !== undefined ? dto.cuponId : existing.cuponId ?? undefined;
    const { subTotal, taxAmount, total: secureFinalTotal, appliedDiscountAmount } = await this.calculateSecureTotals(
      existing.items,
      cuponIdToUse,
      dto.discountAmount !== undefined ? dto.discountAmount : existing.discountAmount
    );

    const finalPayments = dto.payments ?? existing.payments;
    this.validatePaymentsSum(secureFinalTotal, finalPayments);

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
            status: (dto.status?.toUpperCase() as any) ?? 'PAID',
            ...(dto.payments !== undefined ? {
              payments: {
                deleteMany: {},
                create: dto.payments.map(p => ({ method: toDbPaymentMethod(p.method), amount: p.amount })),
              }
            } : {}),
            customerSnapshotName: dto.customerSnapshotName ?? undefined,
            customerAddress: dto.customerAddress ?? undefined,
            orderType: dto.orderType ? toDbOrderType(dto.orderType) : undefined,
            total: secureFinalTotal,
            subTotal: subTotal,
            discountAmount: appliedDiscountAmount,
            taxAmount: taxAmount,
            cuponId: cuponIdToUse,
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
      
      // Remove any existing month-year prefix (e.g. JUN26-) from the user's configured prefix
      // so we don't stack them (e.g. JUL26-JUN26-00001)
      const cleanUserPrefix = (correlativo.prefix ?? '').replace(/^[a-z]{3}\d{2}-/i, '');
      const invoiceNumber = `${dynamicPrefix}${cleanUserPrefix}${padded}`;

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
          status: (dto.status?.toUpperCase() as any) ?? 'PAID',
          ...(dto.payments !== undefined ? {
            payments: {
              deleteMany: {},
              create: dto.payments.map(p => ({ method: toDbPaymentMethod(p.method), amount: p.amount })),
            }
          } : {}),
          customerSnapshotName: dto.customerSnapshotName ?? undefined,
          customerAddress: dto.customerAddress ?? undefined,
          orderType: dto.orderType ? toDbOrderType(dto.orderType) : undefined,
          total: secureFinalTotal,
          subTotal: subTotal,
          discountAmount: appliedDiscountAmount,
          taxAmount: taxAmount,
          cuponId: cuponIdToUse,
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
        finalTotal: secureFinalTotal,
        taxAmount: taxAmount,
        cuponId: cuponIdToUse,
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
    const sentItems = items.filter((i) => i.isSentToKitchen);

    if (sentItems.length === 0) {
      // If nothing is sent to kitchen, the status depends on whether there are items at all.
      // Usually, it stays as is, but we default to pending if recalculating from scratch.
      return OrderStatusDto.pending;
    }

    const anyPending = sentItems.some((i) => i.kitchenStatus === KitchenStatusDto.pending);
    if (anyPending) return OrderStatusDto.pending;

    const anyPreparing = sentItems.some((i) => i.kitchenStatus === KitchenStatusDto.preparing);
    if (anyPreparing) return OrderStatusDto.preparing;

    const allDelivered = sentItems.every((i) => i.kitchenStatus === KitchenStatusDto.delivered);
    if (allDelivered) return OrderStatusDto.delivered;

    const anyReady = sentItems.some((i) => i.kitchenStatus === KitchenStatusDto.ready);
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
