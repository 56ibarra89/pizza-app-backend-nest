import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
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
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OrderPricingService } from './order-pricing.service';
import { OrderFinalizationService } from './order-finalization.service';
import { assertPaymentsMatchTotal } from '../validators/order-payments.validator';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { UserRoleDto } from '../../common';
import { HiddenKitchenTicketsService } from './hidden-kitchen-tickets.service';
import { OrderReferenceResolverService } from './order-reference-resolver.service';
import { OrderTableAssignmentsService } from './order-table-assignments.service';
import { OrderCancellationAuthorizationService } from './order-cancellation-authorization.service';
import {
  ORDER_SYNCHRONIZED_EVENT,
  type OrderSynchronizationMutation,
} from '../events/order-synchronized.event';
import type { OrderEntity } from '../entities/order.entity';
import { requiresKitchenPreparation } from '../validators/order-item-kind';
import { KitchensService } from '../../kitchens/kitchens.service';
import { PrismaService } from '../../prisma/prisma.service';
import { InvoiceIssuingService } from './invoice-issuing.service';
import { OrderTypeDto } from '../dto/order-type.dto';
import {
  DEFAULT_SERVICE_SLA_CONFIG,
  SERVICE_SLA_CONFIG_ID,
  normalizeServiceSlaConfig,
} from '../../common/service-sla.config';
import {
  DEFAULT_VOID_WASTE_POLICY_CONFIG,
  VOID_WASTE_POLICY_CONFIG_ID,
  normalizeVoidWastePolicyConfig,
  type CancellationReasonPolicy,
  type VoidWastePolicyConfig,
} from '../../common/void-waste-policy.config';
import {
  DEFAULT_PAYMENT_METHODS_CONFIG,
  PAYMENT_METHODS_CONFIG_ID,
  normalizePaymentMethodsConfig,
  type PaymentMethodConfig,
} from '../../common/payment-methods.config';
import { PaymentMethodDto } from '../dto/payment-method.dto';
import type { OrderPaymentDto } from '../dto/order-payment.dto';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @Inject(ORDERS_REPOSITORY) private readonly repo: IOrdersRepository,
    private readonly eventEmitter: EventEmitter2,
    private readonly pricing: OrderPricingService,
    private readonly finalization: OrderFinalizationService,
    private readonly hiddenKitchenTickets: HiddenKitchenTicketsService,
    private readonly referenceResolver: OrderReferenceResolverService,
    private readonly tableAssignments: OrderTableAssignmentsService,
    private readonly cancellationAuthorization: OrderCancellationAuthorizationService,
    private readonly kitchens: KitchensService,
    private readonly invoiceIssuing: InvoiceIssuingService,
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

  listByDriverAndDate(driverId: string, startDate: Date, endDate: Date) {
    return this.repo.listByDriverAndDate(driverId, startDate, endDate);
  }

  async getHiddenKitchenTickets(): Promise<string[]> {
    return this.hiddenKitchenTickets.listTicketIds();
  }

  async addHiddenKitchenTickets(
    ticketIds: string[],
    user: AuthenticatedUser,
  ): Promise<void> {
    return this.hiddenKitchenTickets.hide(ticketIds, user.username);
  }

  async getById(id: string) {
    const found = await this.repo.findById(id);
    if (!found) throw new NotFoundException('Orden no encontrada');
    return found;
  }

  async create(dto: CreateOrderDto, user?: AuthenticatedUser) {
    const resolvedPayments = await this.resolvePayments(dto.payments);
    const isDelivery = dto.orderType === OrderTypeDto.delivery;
    const status = isDelivery
      ? OrderStatusDto.pending
      : (dto.status ??
        (dto.payments?.length ? OrderStatusDto.paid : OrderStatusDto.pending));
    const timestamp = dto.timestamp ?? new Date();
    const isSentToKitchen =
      dto.isSentToKitchen ?? !(dto.linkedTables && dto.linkedTables.length > 0);

    const cashierSnapshotName = dto.cashierSnapshotName || user?.username;
    const { customerId, cashierId, shiftId } =
      await this.referenceResolver.resolve({
        ...dto,
        cashierSnapshotName,
      });
    const items = dto.items.map((item) => {
      const mappedItem = {
        ...item,
        giftQuantity: item.giftQuantity ?? 0,
      };

      return requiresKitchenPreparation(mappedItem)
        ? mappedItem
        : {
            ...mappedItem,
            isSentToKitchen: false,
            sentAt: undefined,
            kitchenStatus: undefined,
          };
    });
    const promotion = await this.pricing.resolvePromotion(dto);
    const totals = await this.pricing.calculate(items, promotion);

    const created = await this.repo.create({
      id: dto.id,
      shiftId,
      customerId,
      items,
      subTotal: totals.subTotal,
      discountAmount: totals.discountAmount,
      taxAmount: totals.taxAmount,
      total: totals.total,
      timestamp,
      status: status === OrderStatusDto.paid ? OrderStatusDto.pending : status,
      customerSnapshotName:
        dto.customerSnapshotName ||
        (dto.customerPhone ? `Cliente ${dto.customerPhone}` : undefined),
      cashierId,
      cashierSnapshotName,
      orderType: dto.orderType,
      customerAddress: dto.customerAddress,
      linkedTables: dto.linkedTables,
      isSentToKitchen,
      cuponId: promotion.source === 'coupon' ? promotion.cuponId : undefined,
      discountId:
        promotion.source === 'discount' ? promotion.discountId : undefined,
      happyHourId:
        promotion.source === 'happy-hour' ? promotion.happyHourId : undefined,
      driverId: dto.driverId,
      payments: resolvedPayments,
      customerTendered: dto.customerTendered,
      deliveryChange: dto.deliveryChange,
    });

    if (isDelivery) {
      try {
        await this.prisma.$transaction(async (tx) => {
          await this.invoiceIssuing.issuePendingDeliveryInvoice(tx, {
            orderId: created.id,
            totals,
            promotion,
            customerSnapshotName: dto.customerSnapshotName,
            customerAddress: dto.customerAddress,
            orderType: dto.orderType,
          });
        });
        const updated = await this.getById(created.id);
        this.publishOrder(updated, 'created');
        return updated;
      } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Error al generar factura para delivery ${created.id}: ${errorMsg}`,
        );
      }
    }

    if (status === OrderStatusDto.paid) {
      try {
        const finalized = await this.finalize(
          created.id,
          {
            payments: resolvedPayments,
            customerSnapshotName: dto.customerSnapshotName,
            customerAddress: dto.customerAddress,
            orderType: dto.orderType,
            subTotal: totals.subTotal,
            taxAmount: totals.taxAmount,
            discountAmount: totals.discountAmount,
            finalTotal: totals.total,
            cuponId:
              promotion.source === 'coupon' ? promotion.cuponId : undefined,
            discountId:
              promotion.source === 'discount'
                ? promotion.discountId
                : undefined,
            happyHourId:
              promotion.source === 'happy-hour'
                ? promotion.happyHourId
                : undefined,
            promotionSource: dto.promotionSource,
            promotionCode: dto.promotionCode,
            certificateSerials: dto.certificateSerials,
          },
          'system',
          false,
        );
        this.publishOrder(finalized, 'created');
        return finalized;
      } catch (error) {
        await this.repo.delete(created.id);
        throw error;
      }
    }

    this.publishOrder(created, 'created');
    return created;
  }

  async updateStatus(
    id: string,
    dto: UpdateOrderStatusDto,
    user?: AuthenticatedUser,
  ) {
    const existing = await this.getById(id);
    const wasReadyForPickup = this.isReadyForPickup(existing.items);
    const isFinal =
      existing.status === OrderStatusDto.paid ||
      existing.status === OrderStatusDto.cancelled;

    if (user?.role === UserRoleDto.cocinero) {
      if (
        dto.status === OrderStatusDto.paid ||
        dto.status === OrderStatusDto.cancelled
      ) {
        throw new ForbiddenException(
          'Los cocineros no tienen permiso para cobrar o cancelar órdenes.',
        );
      }

      if (!dto.sentAt || !dto.kitchenId) {
        throw new ForbiddenException(
          'El cocinero debe actualizar un producto de su cocina asignada.',
        );
      }

      const assignedKitchenId = await this.kitchens.getAssignedKitchenIdForDate(
        user.id,
      );
      if (assignedKitchenId !== dto.kitchenId) {
        throw new ForbiddenException(
          'No tienes acceso a esta cocina en el día de hoy.',
        );
      }
    }

    let cancellationPolicy:
      | {
          config: VoidWastePolicyConfig;
          reason: CancellationReasonPolicy;
          wasPrepared: boolean;
          requiresSupervisor: boolean;
        }
      | undefined;
    let authorizerAdmin:
      | Awaited<ReturnType<OrderCancellationAuthorizationService['authorize']>>
      | undefined;

    if (dto.status === OrderStatusDto.cancelled) {
      cancellationPolicy = await this.resolveCancellationPolicy(existing, dto);
      if (cancellationPolicy.requiresSupervisor) {
        authorizerAdmin = await this.cancellationAuthorization.authorize(
          dto.adminPin,
        );
      }
    }
    this.logger.debug(
      `updateStatus start id=${id}, status=${dto.status}, sentAt=${dto.sentAt}, existing=${existing.status}, isFinal=${isFinal}`,
    );

    if (dto.sentAt) {
      this.logger.debug(`Actualizando ticket de cocina sentAt=${dto.sentAt}`);
      if (
        dto.status === OrderStatusDto.paid ||
        dto.status === OrderStatusDto.cancelled
      ) {
        throw new BadRequestException('Status inválido para cocina');
      }

      await this.repo.updateItemsKitchenStatus({
        orderId: id,
        sentAt: new Date(dto.sentAt),
        kitchenStatus: dto.status as unknown as KitchenStatusDto,
        kitchenId: dto.kitchenId,
        itemId: dto.itemId,
      });

      const reloaded = await this.getById(id);

      const derived = this.deriveGlobalStatus(
        reloaded.items,
        reloaded.orderType,
      );
      const nextGlobalStatus =
        existing.status === OrderStatusDto.paid ||
        existing.status === OrderStatusDto.cancelled
          ? existing.status
          : derived;
      this.logger.debug(`Estado global derivado: ${nextGlobalStatus}`);
      const updated = await this.repo.update(id, {
        status: nextGlobalStatus,
        ...(!wasReadyForPickup && this.isReadyForPickup(reloaded.items)
          ? { kitchenReadyAt: new Date() }
          : {}),
      });
      if (!wasReadyForPickup && this.isReadyForPickup(reloaded.items)) {
        this.emitOrderReady(updated);
      }
      this.publishOrder(updated, 'updated');
      return updated;
    }

    if (isFinal) {
      this.logger.debug('La orden ya se encuentra en estado final');
      // Permitir que las órdenes ya pagadas puedan ser anuladas o actualizadas por la cocina
      if (
        existing.status === OrderStatusDto.paid &&
        (dto.status === OrderStatusDto.cancelled ||
          dto.status === OrderStatusDto.preparing ||
          dto.status === OrderStatusDto.ready ||
          dto.status === OrderStatusDto.delivered)
      ) {
        this.logger.debug(
          'Actualización de cocina permitida para una orden pagada',
        );
        // Continuar
      } else {
        this.logger.debug(
          'Actualización ignorada porque la orden ya está finalizada',
        );
        return existing;
      }
    }

    let nextStatus = dto.status;
    if (
      existing.orderType === OrderTypeDto.delivery &&
      nextStatus === OrderStatusDto.delivered &&
      user?.role === UserRoleDto.cocinero
    ) {
      nextStatus = OrderStatusDto.ready;
    }

    if (
      existing.orderType === OrderTypeDto.delivery &&
      dto.status === OrderStatusDto.delivered &&
      user?.role === UserRoleDto.motorizado
    ) {
      const hasKitchenItems = existing.items.some(
        (item) => requiresKitchenPreparation(item) && item.isSentToKitchen,
      );
      if (
        hasKitchenItems &&
        !this.isReadyForPickup(existing.items) &&
        existing.status !== OrderStatusDto.ready
      ) {
        throw new BadRequestException(
          'El pedido aún no está listo en cocina para ser entregado.',
        );
      }
    }

    if (
      nextStatus === OrderStatusDto.paid &&
      existing.status !== OrderStatusDto.paid
    ) {
      assertPaymentsMatchTotal(existing.total, existing.payments);
    }

    const updateItemsKitchen =
      existing.orderType === OrderTypeDto.delivery &&
      (nextStatus === OrderStatusDto.delivered ||
        nextStatus === OrderStatusDto.paid)
        ? undefined
        : this.asKitchenStatusOrUndefined(nextStatus);
    this.logger.debug(
      `Actualizando items a kitchenStatus=${updateItemsKitchen}`,
    );

    const items = updateItemsKitchen
      ? existing.items.map((item) =>
          requiresKitchenPreparation(item)
            ? { ...item, kitchenStatus: updateItemsKitchen }
            : item,
        )
      : existing.items;

    const updateData: Parameters<IOrdersRepository['update']>[1] = {
      status: nextStatus,
      items,
    };
    const becameReadyForPickup =
      !wasReadyForPickup && this.isReadyForPickup(items);
    if (becameReadyForPickup) {
      updateData.kitchenReadyAt = new Date();
    }
    if (
      existing.orderType === OrderTypeDto.delivery &&
      nextStatus === OrderStatusDto.delivered
    ) {
      updateData.deliveredAt = new Date();
    }

    if (cancellationPolicy) {
      const note = dto.cancelReason?.trim();
      const reasonText = note
        ? `${cancellationPolicy.reason.label}: ${note}`
        : cancellationPolicy.reason.label;
      updateData.cancelReason = reasonText;
      updateData.cancellationReasonId = cancellationPolicy.reason.id;
      updateData.cancellationReasonLabel = cancellationPolicy.reason.label;
      updateData.cancellationCategory = cancellationPolicy.reason.category;
      updateData.cancellationCountsAsWaste =
        cancellationPolicy.reason.countsAsWaste ||
        cancellationPolicy.wasPrepared;
      updateData.cancellationWasPrepared = cancellationPolicy.wasPrepared;
      updateData.cancellationRequiresSupervisor =
        cancellationPolicy.requiresSupervisor;
      updateData.cancellationLossAmount = existing.total;
      updateData.cancelledById = authorizerAdmin?.id ?? user?.id;
      updateData.cancelledAt = new Date();

      // Send email to all admins
      const cashierName = user
        ? `${user.firstName || ''} ${user.lastName || ''}`.trim()
        : 'Desconocido';
      const adminName = authorizerAdmin
        ? `${authorizerAdmin.firstName || ''} ${authorizerAdmin.lastName || ''}`.trim()
        : 'No requerido por la política';
      const reasonStr = reasonText;
      const invoiceNum = existing.invoice?.invoiceNumber
        ? `#${existing.invoice.invoiceNumber}`
        : 'Sin Factura';

      this.eventEmitter.emit('order.cancelled', {
        orderId: existing.id,
        invoiceNum,
        cashierName,
        adminName,
        reasonStr,
      });
    }

    const updated = await this.repo.update(id, updateData);
    if (becameReadyForPickup) {
      this.emitOrderReady(updated);
    }
    this.publishOrder(updated, 'updated');
    return updated;
  }

  async startDelivery(id: string, user: AuthenticatedUser) {
    const existing = await this.getById(id);
    if (existing.orderType !== OrderTypeDto.delivery) {
      throw new BadRequestException('La orden no corresponde a un delivery.');
    }
    if (
      user.role === UserRoleDto.motorizado &&
      existing.driverId &&
      existing.driverId !== user.id
    ) {
      throw new ForbiddenException(
        'Este pedido está asignado a otro motorizado.',
      );
    }
    if (existing.deliveryStartedAt) return existing;
    const hasKitchenItems = existing.items.some(
      (item) => requiresKitchenPreparation(item) && item.isSentToKitchen,
    );
    if (
      hasKitchenItems &&
      existing.status !== OrderStatusDto.ready &&
      !this.isReadyForPickup(existing.items)
    ) {
      throw new BadRequestException(
        'El pedido aún no está listo para iniciar la ruta.',
      );
    }

    const updated = await this.repo.update(id, {
      deliveryStartedAt: new Date(),
      deliverySlaAlertedAt: null,
    });
    this.publishOrder(updated, 'updated');
    return updated;
  }

  async getSlaMetrics(daysInput = 30) {
    const days = Math.min(365, Math.max(1, Math.round(daysInput || 30)));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const configRecord = await this.prisma.appConfig.findUnique({
      where: { id: SERVICE_SLA_CONFIG_ID },
      select: { data: true },
    });
    const config = normalizeServiceSlaConfig(
      configRecord?.data ?? DEFAULT_SERVICE_SLA_CONFIG,
    );
    const orders = await this.prisma.order.findMany({
      where: {
        timestamp: { gte: since },
        status: { not: 'CANCELLED' },
      },
      select: {
        timestamp: true,
        kitchenReadyAt: true,
        deliveryStartedAt: true,
        deliveredAt: true,
        items: {
          where: { isSentToKitchen: true, sentAt: { not: null } },
          select: { sentAt: true },
        },
      },
    });

    const kitchenMinutes = orders.flatMap((order) => {
      if (!order.kitchenReadyAt) return [];
      const sentTimes = order.items
        .map((item) => item.sentAt?.getTime())
        .filter((value): value is number => typeof value === 'number');
      const startedAt = sentTimes.length
        ? Math.min(...sentTimes)
        : order.timestamp.getTime();
      return [
        Math.max(0, (order.kitchenReadyAt.getTime() - startedAt) / 60000),
      ];
    });
    const deliveryMinutes = orders.flatMap((order) =>
      order.deliveryStartedAt && order.deliveredAt
        ? [
            Math.max(
              0,
              (order.deliveredAt.getTime() -
                order.deliveryStartedAt.getTime()) /
                60000,
            ),
          ]
        : [],
    );
    const summarize = (values: number[], limit: number) => ({
      completed: values.length,
      averageMinutes: values.length
        ? Math.round(
            (values.reduce((total, value) => total + value, 0) /
              values.length) *
              10,
          ) / 10
        : 0,
      onTimeCount: values.filter((value) => value < limit).length,
      onTimePercent: values.length
        ? Math.round(
            (values.filter((value) => value < limit).length / values.length) *
              100,
          )
        : 0,
    });

    return {
      days,
      config,
      kitchen: summarize(kitchenMinutes, config.kitchenCriticalMinutes),
      delivery: summarize(deliveryMinutes, config.deliveryMaxMinutes),
    };
  }

  async getCancellationMetrics(startDate: Date, endDate: Date) {
    if (
      Number.isNaN(startDate.getTime()) ||
      Number.isNaN(endDate.getTime()) ||
      endDate < startDate
    ) {
      throw new BadRequestException('El rango de fechas no es válido.');
    }

    const orders = await this.prisma.order.findMany({
      where: {
        status: 'CANCELLED',
        cancelledAt: { gte: startDate, lte: endDate },
      },
      orderBy: { cancelledAt: 'desc' },
      select: {
        id: true,
        invoiceNumber: true,
        cancelledAt: true,
        cancellationReasonId: true,
        cancellationReasonLabel: true,
        cancellationCategory: true,
        cancellationCountsAsWaste: true,
        cancellationWasPrepared: true,
        cancellationRequiresSupervisor: true,
        cancellationLossAmount: true,
        total: true,
        cashierSnapshotName: true,
      },
    });

    const categoryMap = new Map<
      string,
      { category: string; count: number; amount: number }
    >();
    const reasonMap = new Map<
      string,
      {
        reasonId: string;
        label: string;
        category: string;
        count: number;
        amount: number;
      }
    >();
    let totalAffectedAmount = 0;
    let totalWasteAmount = 0;

    const recent = orders.map((order) => {
      const amount = (order.cancellationLossAmount ?? order.total).toNumber();
      const category = order.cancellationCategory ?? 'OTHER';
      const reasonId = order.cancellationReasonId ?? 'legacy';
      const label = order.cancellationReasonLabel ?? 'Anulación anterior';
      totalAffectedAmount += amount;
      if (order.cancellationCountsAsWaste) totalWasteAmount += amount;

      const categoryEntry = categoryMap.get(category) ?? {
        category,
        count: 0,
        amount: 0,
      };
      categoryEntry.count += 1;
      categoryEntry.amount += amount;
      categoryMap.set(category, categoryEntry);

      const reasonEntry = reasonMap.get(reasonId) ?? {
        reasonId,
        label,
        category,
        count: 0,
        amount: 0,
      };
      reasonEntry.count += 1;
      reasonEntry.amount += amount;
      reasonMap.set(reasonId, reasonEntry);

      return {
        orderId: order.id,
        invoiceNumber: order.invoiceNumber,
        cancelledAt: order.cancelledAt?.toISOString(),
        reasonId,
        reasonLabel: label,
        category,
        amount,
        countsAsWaste: order.cancellationCountsAsWaste,
        wasPrepared: order.cancellationWasPrepared,
        requiredSupervisor: order.cancellationRequiresSupervisor,
        cashierName: order.cashierSnapshotName,
      };
    });

    return {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      totalCancelledOrders: orders.length,
      totalAffectedAmount: Math.round(totalAffectedAmount * 100) / 100,
      totalWasteAmount: Math.round(totalWasteAmount * 100) / 100,
      byCategory: [...categoryMap.values()].sort((a, b) => b.amount - a.amount),
      byReason: [...reasonMap.values()].sort((a, b) => b.amount - a.amount),
      recent: recent.slice(0, 100),
    };
  }

  async getPaymentMetrics(startDate: Date, endDate: Date) {
    if (
      Number.isNaN(startDate.getTime()) ||
      Number.isNaN(endDate.getTime()) ||
      endDate < startDate
    ) {
      throw new BadRequestException('El rango de fechas no es válido.');
    }
    const payments = await this.prisma.payment.findMany({
      where: {
        order: {
          status: 'PAID',
          timestamp: { gte: startDate, lte: endDate },
        },
      },
      select: {
        method: true,
        amount: true,
        methodConfigId: true,
        methodSnapshotName: true,
        methodType: true,
        currency: true,
        commissionRate: true,
        commissionAmount: true,
        reference: true,
      },
    });
    const groups = new Map<
      string,
      {
        methodId: string;
        name: string;
        type: string;
        currency: string;
        transactionCount: number;
        referencedCount: number;
        grossAmount: number;
        commissionAmount: number;
        netAmount: number;
      }
    >();
    for (const payment of payments) {
      const methodId = payment.methodConfigId ?? `legacy-${payment.method}`;
      const gross = payment.amount.toNumber();
      const commission =
        payment.commissionAmount?.toNumber() ??
        Math.round(gross * (payment.commissionRate?.toNumber() ?? 0)) / 100;
      const current = groups.get(methodId) ?? {
        methodId,
        name: payment.methodSnapshotName ?? payment.method,
        type: payment.methodType ?? payment.method,
        currency: payment.currency ?? 'NIO',
        transactionCount: 0,
        referencedCount: 0,
        grossAmount: 0,
        commissionAmount: 0,
        netAmount: 0,
      };
      current.transactionCount += 1;
      if (payment.reference) current.referencedCount += 1;
      current.grossAmount += gross;
      current.commissionAmount += commission;
      current.netAmount += gross - commission;
      groups.set(methodId, current);
    }
    const round = (value: number) => Math.round(value * 100) / 100;
    const breakdown = [...groups.values()]
      .map((group) => ({
        ...group,
        grossAmount: round(group.grossAmount),
        commissionAmount: round(group.commissionAmount),
        netAmount: round(group.netAmount),
      }))
      .sort((a, b) => b.grossAmount - a.grossAmount);
    return {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      transactionCount: payments.length,
      grossAmount: round(
        breakdown.reduce((sum, group) => sum + group.grossAmount, 0),
      ),
      commissionAmount: round(
        breakdown.reduce((sum, group) => sum + group.commissionAmount, 0),
      ),
      netAmount: round(
        breakdown.reduce((sum, group) => sum + group.netAmount, 0),
      ),
      breakdown,
    };
  }

  async updateTables(id: string, tableIds: string[]) {
    await this.tableAssignments.replace(id, tableIds);

    const updated = await this.getById(id);
    this.publishOrder(updated, 'updated');
    return updated;
  }

  async updateItems(id: string, dto: UpdateOrderItemsDto) {
    const existing = await this.getById(id);
    const wasReadyForPickup = this.isReadyForPickup(existing.items);
    const isFinal =
      existing.status === OrderStatusDto.paid ||
      existing.status === OrderStatusDto.cancelled;

    const mappedItems: CartItemEntity[] = dto.items.map((item) => {
      const mappedItem: CartItemEntity = {
        ...item,
        giftQuantity: item.giftQuantity ?? 0,
      };

      return requiresKitchenPreparation(mappedItem)
        ? mappedItem
        : {
            ...mappedItem,
            isSentToKitchen: false,
            sentAt: undefined,
            kitchenStatus: undefined,
          };
    });
    const nextStatus = isFinal
      ? existing.status
      : this.deriveGlobalStatus(mappedItems, existing.orderType);

    const becameReadyForPickup =
      !isFinal && !wasReadyForPickup && this.isReadyForPickup(mappedItems);

    const promotion = await this.pricing.resolvePromotion(dto, {
      cuponId: existing.cuponId,
      discountId: existing.discountId,
      happyHourId: existing.happyHourId,
    });
    const totals = await this.pricing.calculate(mappedItems, promotion);

    const updated = await this.repo.update(id, {
      items: mappedItems,
      total: totals.total,
      subTotal: totals.subTotal,
      discountAmount: totals.discountAmount,
      taxAmount: totals.taxAmount,
      cuponId: promotion.source === 'coupon' ? promotion.cuponId : null,
      discountId: promotion.source === 'discount' ? promotion.discountId : null,
      happyHourId:
        promotion.source === 'happy-hour' ? promotion.happyHourId : null,
      status: nextStatus,
      isSentToKitchen: dto.isSentToKitchen,
    });
    if (becameReadyForPickup) {
      this.emitOrderReady(updated);
    }
    this.publishOrder(updated, 'updated');
    return updated;
  }

  async finalize(
    id: string,
    dto: FinalizeOrderDto,
    user?: AuthenticatedUser | string,
    publishEvent = true,
  ) {
    const existing = await this.getById(id);
    if (existing.status === OrderStatusDto.paid) return existing;

    const resolvedPayments = await this.resolvePayments(dto.payments);
    await this.finalization.finalize(
      existing,
      resolvedPayments ? { ...dto, payments: resolvedPayments } : dto,
      user,
    );
    const finalized = await this.getById(id);
    if (publishEvent) {
      this.publishOrder(finalized, 'updated');
    }
    return finalized;
  }

  private async resolveCancellationPolicy(
    order: OrderEntity,
    dto: UpdateOrderStatusDto,
  ) {
    const saved = await this.prisma.appConfig.findUnique({
      where: { id: VOID_WASTE_POLICY_CONFIG_ID },
      select: { data: true },
    });
    const config = normalizeVoidWastePolicyConfig(
      saved?.data ?? DEFAULT_VOID_WASTE_POLICY_CONFIG,
    );
    const reason = config.reasons.find(
      (candidate) => candidate.id === dto.cancelReasonId && candidate.isActive,
    );
    if (!reason) {
      throw new BadRequestException(
        'Selecciona un motivo de anulación activo y válido.',
      );
    }

    const wasPrepared = order.items.some(
      (item) =>
        requiresKitchenPreparation(item) &&
        item.isSentToKitchen &&
        (item.kitchenStatus === KitchenStatusDto.preparing ||
          item.kitchenStatus === KitchenStatusDto.ready ||
          item.kitchenStatus === KitchenStatusDto.delivered),
    );
    const requiresSupervisor =
      reason.requiresSupervisor ||
      (config.requireSupervisorForPaidOrders &&
        order.status === OrderStatusDto.paid) ||
      (config.requireSupervisorWhenPreparationStarted && wasPrepared);

    return { config, reason, wasPrepared, requiresSupervisor };
  }

  private async resolvePayments(
    payments?: OrderPaymentDto[],
  ): Promise<OrderPaymentDto[] | undefined> {
    if (!payments) return undefined;
    const [saved, general] = await Promise.all([
      this.prisma.appConfig.findUnique({
        where: { id: PAYMENT_METHODS_CONFIG_ID },
        select: { data: true },
      }),
      this.prisma.appConfig.findUnique({
        where: { id: 'general_config' },
        select: { data: true },
      }),
    ]);
    const config = normalizePaymentMethodsConfig(
      saved?.data ?? DEFAULT_PAYMENT_METHODS_CONFIG,
    );

    return payments.map((payment) => {
      const configured = this.findPaymentMethod(config.methods, payment);
      if (!configured || !configured.isActive) {
        throw new BadRequestException(
          'El método de pago seleccionado ya no está disponible.',
        );
      }
      const reference = payment.reference?.trim();
      if (
        configured.requiresReference &&
        (!reference || reference.length < 4)
      ) {
        throw new BadRequestException(
          `${configured.name} requiere una referencia de al menos 4 caracteres.`,
        );
      }
      const amount = Math.round(payment.amount * 100) / 100;
      const commissionAmount =
        Math.round(amount * configured.commissionRate) / 100;
      const generalData =
        typeof general?.data === 'object' &&
        general.data !== null &&
        !Array.isArray(general.data)
          ? general.data
          : undefined;
      const exchangeRate =
        configured.currency === 'USD'
          ? Math.max(0.0001, Number(generalData?.exchangeRate) || 36.5)
          : 1;

      return {
        ...payment,
        method: this.toLegacyPaymentMethod(configured),
        methodConfigId: configured.id,
        reference,
        methodSnapshotName: configured.name,
        methodType: configured.type,
        currency: configured.currency,
        originalAmount: Math.round((amount / exchangeRate) * 100) / 100,
        exchangeRate,
        commissionRate: configured.commissionRate,
        commissionAmount,
      };
    });
  }

  private findPaymentMethod(
    methods: PaymentMethodConfig[],
    payment: OrderPaymentDto,
  ) {
    if (payment.methodConfigId) {
      return methods.find((method) => method.id === payment.methodConfigId);
    }
    const expectedType =
      payment.method === PaymentMethodDto.EFECTIVO
        ? 'CASH'
        : payment.method === PaymentMethodDto.TARJETA
          ? 'CARD_POS'
          : undefined;
    return methods.find(
      (method) =>
        method.isActive &&
        (expectedType
          ? method.type === expectedType
          : method.type === 'BANK_TRANSFER' ||
            method.type === 'DIGITAL_WALLET'),
    );
  }

  private toLegacyPaymentMethod(method: PaymentMethodConfig): PaymentMethodDto {
    if (method.type === 'CASH') return PaymentMethodDto.EFECTIVO;
    if (method.type === 'CARD_POS') return PaymentMethodDto.TARJETA;
    return PaymentMethodDto.APP;
  }

  private publishOrder(
    order: OrderEntity,
    mutation: OrderSynchronizationMutation,
  ): void {
    this.eventEmitter.emit(ORDER_SYNCHRONIZED_EVENT, {
      mutation,
      order,
    });
  }

  private isReadyForPickup(items: CartItemEntity[]): boolean {
    const sentItems = items.filter(
      (item) => requiresKitchenPreparation(item) && item.isSentToKitchen,
    );
    if (sentItems.length === 0) return false;
    return sentItems.every(
      (i) =>
        i.kitchenStatus === KitchenStatusDto.ready ||
        i.kitchenStatus === KitchenStatusDto.delivered,
    );
  }

  private emitOrderReady(order: OrderEntity): void {
    this.eventEmitter.emit('order.ready', {
      orderId: order.id,
      isFullOrder: true,
      tableName: order.linkedTables?.[0],
      customerName: order.customerSnapshotName,
      orderType: order.orderType,
      targetUsername: order.cashierSnapshotName,
      driverId: order.driverId,
    });
  }

  private deriveGlobalStatus(
    items: CartItemEntity[],
    orderType?: OrderTypeDto,
  ): OrderStatusDto {
    const sentItems = items.filter(
      (item) => requiresKitchenPreparation(item) && item.isSentToKitchen,
    );

    if (sentItems.length === 0) {
      return OrderStatusDto.pending;
    }

    const anyPending = sentItems.some(
      (i) => i.kitchenStatus === KitchenStatusDto.pending,
    );
    if (anyPending) return OrderStatusDto.pending;

    const anyPreparing = sentItems.some(
      (i) => i.kitchenStatus === KitchenStatusDto.preparing,
    );
    if (anyPreparing) return OrderStatusDto.preparing;

    const allDelivered = sentItems.every(
      (i) => i.kitchenStatus === KitchenStatusDto.delivered,
    );
    if (allDelivered) {
      if (orderType === OrderTypeDto.delivery) {
        return OrderStatusDto.ready;
      }
      return OrderStatusDto.delivered;
    }

    const anyReady = sentItems.some(
      (i) => i.kitchenStatus === KitchenStatusDto.ready,
    );
    if (anyReady) return OrderStatusDto.ready;

    return OrderStatusDto.pending;
  }

  private asKitchenStatusOrUndefined(
    status: OrderStatusDto,
  ): KitchenStatusDto | undefined {
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
