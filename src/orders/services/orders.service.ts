import {
  BadRequestException,
  ConflictException,
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
import type { SplitOrderCheckoutDto } from '../dto/split-order-checkout.dto';
import { OrderStatusDto } from '../dto/order-status.dto';
import { OrderPromotionSourceDto } from '../dto/order-promotion-source.dto';
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
import {
  isDeliveryChargeOrderItem,
  isPackagingOrderItem,
  isSplitBillCreditOrderItem,
  isSplitBillOrderItem,
  isSplitBillPartialPaymentItem,
  requiresKitchenPreparation,
} from '../validators/order-item-kind';
import { KitchensService } from '../../kitchens/kitchens.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CertificadoStatus, Prisma } from '@prisma/client';
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
  isValidPosReference,
  normalizePosReference,
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
    private readonly prisma: PrismaService,
  ) {}

  listTodayOrActive(now = new Date()) {
    return this.repo.listTodayOrActive(now);
  }

  listHistory(params: {
    startDate: Date;
    endDate: Date;
    page: number;
    pageSize: number;
    search?: string;
    paymentMethodId?: string;
    view?: 'all' | 'invoices';
    statuses?: OrderStatusDto[];
  }) {
    const maxRangeMs = 366 * 24 * 60 * 60 * 1000;
    if (
      Number.isNaN(params.startDate.getTime()) ||
      Number.isNaN(params.endDate.getTime()) ||
      params.endDate < params.startDate
    ) {
      throw new BadRequestException('El rango de fechas no es válido.');
    }
    if (params.endDate.getTime() - params.startDate.getTime() > maxRangeMs) {
      throw new BadRequestException(
        'El rango máximo para una consulta histórica es de 366 días.',
      );
    }
    return this.repo.listHistory(params);
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
    if (dto.items.some((item) => isSplitBillCreditOrderItem(item))) {
      throw new BadRequestException(
        'Los abonos de subcuenta solo pueden ser generados por el flujo de división de cuenta.',
      );
    }
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
    const rawItems = dto.items.map((item) => {
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
    const items = await this.pricing.normalizeComboItems(rawItems);
    const promotion = await this.pricing.resolvePromotion(dto);
    const { items: pricedItems, totals } =
      await this.pricing.calculateWithPrices(items, promotion);
    const certificateSerials = this.extractCertificateSerials(
      pricedItems,
      dto.certificateSerials,
    );
    const cuponId =
      promotion.source === 'coupon' ? promotion.cuponId : undefined;

    await this.assertPendingBenefitsAvailable({
      cuponId,
      certificateSerials,
    });

    const created = await this.repo.create({
      id: dto.id,
      shiftId,
      customerId,
      items: pricedItems,
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
      cuponId,
      discountId:
        promotion.source === 'discount' ? promotion.discountId : undefined,
      happyHourId:
        promotion.source === 'happy-hour' ? promotion.happyHourId : undefined,
      driverId: dto.driverId,
      payments: resolvedPayments,
      customerTendered: dto.customerTendered,
      deliveryChange: dto.deliveryChange,
      certificateSerials,
    });

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
            cuponId,
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
            certificateSerials,
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
      if (existing.status === OrderStatusDto.paid && existing.shiftId) {
        const sourceShift = await this.prisma.shift.findUnique({
          where: { id: existing.shiftId },
          select: { status: true },
        });
        if (sourceShift?.status !== 'OPEN') {
          throw new BadRequestException(
            'No se puede anular una factura perteneciente a un turno cerrado.',
          );
        }
      }
      const paidSplitOrders = await this.prisma.order.count({
        where: {
          parentOrderId: existing.id,
          status: 'PAID',
        },
      });
      if (paidSplitOrders > 0) {
        throw new BadRequestException(
          'Debe anular primero las facturas de las subcuentas antes de anular la cuenta principal.',
        );
      }
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
      const kitchenReadyAt =
        !wasReadyForPickup && this.isReadyForPickup(reloaded.items)
          ? new Date()
          : undefined;
      const updatedAt = await this.repo.updateOperationalStatus(id, {
        status: nextGlobalStatus,
        kitchenReadyAt,
      });
      const updated: OrderEntity = {
        ...reloaded,
        status: nextGlobalStatus,
        updatedAt,
        ...(kitchenReadyAt ? { kitchenReadyAt } : {}),
      };
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
      return this.finalize(id, { payments: existing.payments }, user);
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
      status:
        existing.status === OrderStatusDto.paid &&
        dto.status !== OrderStatusDto.cancelled
          ? OrderStatusDto.paid
          : nextStatus,
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

    let cancellationEvent:
      | {
          orderId: string;
          invoiceNum: string;
          cashierName: string;
          adminName: string;
          reasonStr: string;
        }
      | undefined;

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
      updateData.certificateSerials = null;

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

      cancellationEvent = {
        orderId: existing.id,
        invoiceNum,
        cashierName,
        adminName,
        reasonStr,
      };
    }

    const shouldReversePaidBenefits =
      Boolean(cancellationPolicy) && existing.status === OrderStatusDto.paid;
    const splitRestore = shouldReversePaidBenefits
      ? await this.prepareSplitCancellationRestore(existing)
      : undefined;
    if (splitRestore) {
      updateData.cancellationLossAmount = 0;
      updateData.cancellationCountsAsWaste = false;
    }
    let restoredSplitParent: OrderEntity | undefined;
    const updated = shouldReversePaidBenefits
      ? await this.prisma.$transaction(async (tx) => {
          const lockedChild = await tx.$queryRaw<Array<{ status: string }>>`
            SELECT status FROM "Order" WHERE id = ${id} FOR UPDATE
          `;
          if (lockedChild[0]?.status !== 'PAID') {
            throw new ConflictException(
              'La factura cambió mientras se procesaba su anulación.',
            );
          }
          if (splitRestore) {
            await this.lockUnchangedSplitParent(tx, splitRestore.parent, true);
            restoredSplitParent = await this.repo.update(
              splitRestore.parent.id,
              splitRestore.update,
              tx,
            );
          }
          await tx.certificado.updateMany({
            where: {
              redeemedOrderId: id,
              status: CertificadoStatus.ENTREGADO,
            },
            data: {
              status: CertificadoStatus.DISPONIBLE,
              redeemedAt: null,
              redeemedOrderId: null,
            },
          });
          if (existing.cuponId && existing.couponConsumptionRecorded) {
            const replacementSibling = existing.parentOrderId
              ? await tx.order.findFirst({
                  where: {
                    parentOrderId: existing.parentOrderId,
                    id: { not: existing.id },
                    status: 'PAID',
                    cuponId: existing.cuponId,
                  },
                  select: { id: true, couponConsumptionRecorded: true },
                })
              : null;
            if (replacementSibling) {
              if (!replacementSibling.couponConsumptionRecorded) {
                await tx.order.update({
                  where: { id: replacementSibling.id },
                  data: { couponConsumptionRecorded: true },
                });
              }
            } else {
              await tx.cupon.updateMany({
                where: {
                  id: existing.cuponId,
                  currentUses: { gt: 0 },
                },
                data: {
                  currentUses: { decrement: 1 },
                },
              });
            }
          }
          return this.repo.update(id, updateData, tx);
        })
      : await this.repo.update(id, updateData);
    if (restoredSplitParent) {
      this.publishOrder(restoredSplitParent, 'updated');
    }
    if (cancellationEvent) {
      this.eventEmitter.emit('order.cancelled', cancellationEvent);
    }
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
          OR: [
            { paidAt: { gte: startDate, lte: endDate } },
            {
              paidAt: null,
              timestamp: { gte: startDate, lte: endDate },
            },
          ],
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
        originalAmount: true,
        exchangeRate: true,
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
        grossAmountNio: number;
        commissionAmountNio: number;
        netAmountNio: number;
      }
    >();
    for (const payment of payments) {
      const methodId = payment.methodConfigId ?? `legacy-${payment.method}`;
      const gross = payment.amount.toNumber();
      const commission =
        payment.commissionAmount?.toNumber() ??
        Math.round(gross * (payment.commissionRate?.toNumber() ?? 0)) / 100;
      const currency = payment.currency ?? 'NIO';
      const exchangeRate = Math.max(
        0.0001,
        payment.exchangeRate?.toNumber() ?? 1,
      );
      const originalGross =
        currency === 'USD'
          ? (payment.originalAmount?.toNumber() ?? gross / exchangeRate)
          : gross;
      const originalCommission =
        currency === 'USD' ? commission / exchangeRate : commission;
      const current = groups.get(methodId) ?? {
        methodId,
        name: payment.methodSnapshotName ?? payment.method,
        type: payment.methodType ?? payment.method,
        currency,
        transactionCount: 0,
        referencedCount: 0,
        grossAmount: 0,
        commissionAmount: 0,
        netAmount: 0,
        grossAmountNio: 0,
        commissionAmountNio: 0,
        netAmountNio: 0,
      };
      current.transactionCount += 1;
      if (payment.reference) current.referencedCount += 1;
      current.grossAmount += originalGross;
      current.commissionAmount += originalCommission;
      current.netAmount += originalGross - originalCommission;
      current.grossAmountNio += gross;
      current.commissionAmountNio += commission;
      current.netAmountNio += gross - commission;
      groups.set(methodId, current);
    }
    const round = (value: number) => Math.round(value * 100) / 100;
    const breakdown = [...groups.values()]
      .map((group) => ({
        ...group,
        grossAmount: round(group.grossAmount),
        commissionAmount: round(group.commissionAmount),
        netAmount: round(group.netAmount),
        grossAmountNio: round(group.grossAmountNio),
        commissionAmountNio: round(group.commissionAmountNio),
        netAmountNio: round(group.netAmountNio),
      }))
      .sort((a, b) => b.grossAmountNio - a.grossAmountNio);
    return {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      transactionCount: payments.length,
      grossAmount: round(
        breakdown.reduce((sum, group) => sum + group.grossAmountNio, 0),
      ),
      commissionAmount: round(
        breakdown.reduce((sum, group) => sum + group.commissionAmountNio, 0),
      ),
      netAmount: round(
        breakdown.reduce((sum, group) => sum + group.netAmountNio, 0),
      ),
      breakdown,
    };
  }

  async updateTables(id: string, tableIds: string[]) {
    const affectedOrderIds = await this.tableAssignments.replace(id, tableIds);
    const affectedOrders = await Promise.all(
      affectedOrderIds.map((orderId) => this.getById(orderId)),
    );
    affectedOrders.forEach((order) => this.publishOrder(order, 'updated'));

    const updated = affectedOrders.find((order) => order.id === id);
    if (!updated) throw new NotFoundException('Orden no encontrada');
    return updated;
  }

  async updateItems(id: string, dto: UpdateOrderItemsDto) {
    const existing = await this.getById(id);
    const existingItemIds = new Set(
      existing.items.flatMap((item) =>
        typeof item.id === 'number' ? [item.id] : [],
      ),
    );
    const wasReadyForPickup = this.isReadyForPickup(existing.items);
    const isFinal =
      existing.status === OrderStatusDto.paid ||
      existing.status === OrderStatusDto.cancelled;

    const seenItemIds = new Set<number>();
    const rawItems: CartItemEntity[] = dto.items.map((item) => {
      let resolvedId: number | undefined;
      if (
        item.id !== undefined &&
        existingItemIds.has(item.id) &&
        !seenItemIds.has(item.id)
      ) {
        resolvedId = item.id;
        seenItemIds.add(item.id);
      }
      const mappedItem: CartItemEntity = {
        ...item,
        id: resolvedId,
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
    this.assertSplitBillCreditsUnchanged(existing.items, rawItems);
    const mappedItems = await this.pricing.normalizeComboItems(rawItems);
    const nextStatus = isFinal
      ? existing.status
      : this.deriveGlobalStatus(mappedItems, existing.orderType);

    const becameReadyForPickup =
      !isFinal && !wasReadyForPickup && this.isReadyForPickup(mappedItems);

    if (isFinal) {
      const existingById = new Map(
        existing.items.flatMap((item) =>
          typeof item.id === 'number' ? [[item.id, item] as const] : [],
        ),
      );
      const lockedItems: CartItemEntity[] = mappedItems.map((item, idx) => {
        const prev =
          (item.id !== undefined ? existingById.get(item.id) : undefined) ??
          existing.items[idx];
        return prev
          ? {
              ...prev,
              isSentToKitchen: item.isSentToKitchen,
              sentAt: item.sentAt ?? prev.sentAt,
              kitchenStatus: item.kitchenStatus ?? prev.kitchenStatus,
              comboSelections: item.comboSelections ?? prev.comboSelections,
            }
          : item;
      });
      const updated = await this.repo.update(id, {
        items: lockedItems,
        total: existing.total,
        subTotal: existing.subTotal ?? null,
        discountAmount: existing.discountAmount ?? null,
        taxAmount: existing.taxAmount ?? null,
        cuponId: existing.cuponId ?? null,
        discountId: existing.discountId ?? null,
        happyHourId: existing.happyHourId ?? null,
        status: existing.status,
        isSentToKitchen: dto.isSentToKitchen ?? existing.isSentToKitchen,
        certificateSerials: null,
      });
      if (
        existing.status === OrderStatusDto.paid &&
        !wasReadyForPickup &&
        this.isReadyForPickup(lockedItems)
      ) {
        this.emitOrderReady(updated);
      }
      this.publishOrder(updated, 'updated');
      return updated;
    }

    const promotion = await this.pricing.resolvePromotion(
      dto,
      {
        cuponId: existing.cuponId,
        discountId: existing.discountId,
        happyHourId: existing.happyHourId,
      },
      existing.timestamp,
    );
    const unadjusted = await this.pricing.calculateWithPrices(
      mappedItems,
      promotion,
    );
    const hasSplitAdjustedDiscount =
      typeof existing.discountAmount === 'number' &&
      existing.discountAmount >= 0 &&
      dto.discountAmount !== undefined &&
      Math.abs(dto.discountAmount - existing.discountAmount) < 0.01 &&
      ((promotion.source === 'none' && existing.discountAmount > 0) ||
        (promotion.source !== 'none' &&
          existing.discountAmount + 0.01 < unadjusted.totals.discountAmount));
    const { items: pricedItems, totals } = hasSplitAdjustedDiscount
      ? await this.pricing.applyDiscountOverride(
          unadjusted,
          existing.discountAmount ?? 0,
        )
      : unadjusted;
    const certificateSerials = this.extractCertificateSerials(
      pricedItems,
      dto.certificateSerials,
    );
    const cuponId = promotion.source === 'coupon' ? promotion.cuponId : null;

    await this.assertPendingBenefitsAvailable({
      cuponId: cuponId ?? undefined,
      certificateSerials,
      excludeOrderId: id,
    });

    const updated = await this.repo.update(id, {
      items: pricedItems,
      total: totals.total,
      subTotal: totals.subTotal,
      discountAmount: totals.discountAmount,
      taxAmount: totals.taxAmount,
      cuponId,
      discountId: promotion.source === 'discount' ? promotion.discountId : null,
      happyHourId:
        promotion.source === 'happy-hour' ? promotion.happyHourId : null,
      status: nextStatus,
      isSentToKitchen: dto.isSentToKitchen,
      certificateSerials,
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
    if (existing.status === OrderStatusDto.cancelled) {
      throw new BadRequestException(
        'No se puede cobrar ni facturar una orden anulada.',
      );
    }

    const certificateSerials = this.extractCertificateSerials(
      existing.items,
      dto.certificateSerials ?? existing.certificateSerials,
    );
    const effectiveCuponId =
      dto.promotionSource &&
      dto.promotionSource !== OrderPromotionSourceDto.coupon
        ? undefined
        : (dto.cuponId ?? existing.cuponId);
    await this.assertPendingBenefitsAvailable({
      cuponId: effectiveCuponId,
      certificateSerials,
      excludeOrderId: id,
    });

    const { customerId } =
      dto.customerId || dto.customerPhone || dto.customerSnapshotName
        ? await this.referenceResolver.resolve({
            customerId: dto.customerId ?? existing.customerId,
            customerSnapshotName:
              dto.customerSnapshotName ?? existing.customerSnapshotName,
            customerPhone: dto.customerPhone ?? existing.customerPhone,
            customerAddress: dto.customerAddress ?? existing.customerAddress,
          })
        : { customerId: existing.customerId };

    const resolvedPayments = await this.resolvePayments(dto.payments);
    await this.finalization.finalize(
      existing,
      {
        ...dto,
        ...(customerId ? { customerId } : {}),
        ...(resolvedPayments ? { payments: resolvedPayments } : {}),
        ...(certificateSerials.length > 0 ? { certificateSerials } : {}),
      },
      user,
    );
    const finalized = await this.getById(id);
    if (publishEvent) {
      this.publishOrder(finalized, 'updated');
    }
    return finalized;
  }

  async splitCheckout(
    id: string,
    dto: SplitOrderCheckoutDto,
    user?: AuthenticatedUser,
  ): Promise<{ paidOrder: OrderEntity; parentOrder: OrderEntity }> {
    if (user?.role === UserRoleDto.cocinero) {
      throw new ForbiddenException('Los cocineros no pueden facturar órdenes.');
    }

    const existing = await this.getById(id);
    if (
      existing.status === OrderStatusDto.paid ||
      existing.status === OrderStatusDto.cancelled
    ) {
      throw new BadRequestException('La orden ya fue cobrada o anulada.');
    }
    if (
      dto.mode === 'items' &&
      existing.items.some(isSplitBillCreditOrderItem)
    ) {
      throw new BadRequestException(
        'No se puede cambiar a división por productos después de registrar abonos por monto.',
      );
    }

    if (!dto.payments?.length) {
      throw new BadRequestException(
        'Debe especificar al menos un método de pago para cobrar la subcuenta.',
      );
    }

    const supplementalRawItems: CartItemEntity[] = [];
    const coreSubRawItems: CartItemEntity[] = [];
    for (const rawItem of dto.items) {
      const mapped: CartItemEntity = {
        ...rawItem,
        giftQuantity: rawItem.giftQuantity ?? 0,
      };
      if (isPackagingOrderItem(mapped) || isDeliveryChargeOrderItem(mapped)) {
        supplementalRawItems.push({
          ...mapped,
          id: undefined,
          isSentToKitchen: false,
          sentAt: undefined,
          kitchenStatus: undefined,
        });
      } else {
        coreSubRawItems.push(mapped);
      }
    }

    if (coreSubRawItems.length === 0) {
      throw new BadRequestException(
        'La subcuenta debe incluir al menos un ítem a cobrar.',
      );
    }

    const nowMs = Date.now();
    let remainingParentItems: CartItemEntity[] = [];
    let childRawItems: CartItemEntity[] = [];
    let settlesSplit = false;

    if (dto.mode === 'items') {
      const subtracted = this.subtractSubAccountItems(
        existing.items,
        coreSubRawItems,
        nowMs,
      );
      remainingParentItems = subtracted.remainingParentItems;
      const hasRemainingProductItems = remainingParentItems.some(
        (item) =>
          !isSplitBillOrderItem(item) &&
          !isPackagingOrderItem(item) &&
          !isDeliveryChargeOrderItem(item) &&
          item.quantity > 0,
      );
      settlesSplit = !hasRemainingProductItems;
      const remainingSupplementalItems = settlesSplit
        ? remainingParentItems.filter(
            (item) =>
              isPackagingOrderItem(item) || isDeliveryChargeOrderItem(item),
          )
        : [];
      childRawItems = [
        ...subtracted.matchedCoreItems,
        ...remainingSupplementalItems.map((item) => ({
          ...item,
          id: undefined,
        })),
        ...supplementalRawItems,
      ];
      if (settlesSplit) remainingParentItems = [];
    } else {
      if (
        coreSubRawItems.length !== 1 ||
        !isSplitBillPartialPaymentItem(coreSubRawItems[0])
      ) {
        throw new BadRequestException(
          'La subcuenta por monto debe contener únicamente su ítem de pago parcial.',
        );
      }
      if (dto.subAccountAmount === undefined) {
        throw new BadRequestException(
          'Debe especificar el monto de la subcuenta.',
        );
      }
      const coreTotals = await this.pricing.calculate(coreSubRawItems, {
        source: 'none',
      });
      const subBaseSubtotal = Number(coreTotals.subTotal.toFixed(2));
      const authoritativeSubAccountAmount = Number(coreTotals.total.toFixed(2));
      if (subBaseSubtotal <= 0 || authoritativeSubAccountAmount <= 0) {
        throw new BadRequestException(
          'El monto de la subcuenta debe ser mayor a cero.',
        );
      }
      if (
        Math.abs(
          Math.round(authoritativeSubAccountAmount * 100) -
            Math.round(dto.subAccountAmount * 100),
        ) > 1
      ) {
        throw new BadRequestException(
          'El monto de la subcuenta no coincide con el total calculado.',
        );
      }
      if (authoritativeSubAccountAmount - existing.total > 0.01) {
        throw new BadRequestException(
          'El monto de la subcuenta supera el saldo pendiente de la mesa.',
        );
      }
      const subAccountAmount = authoritativeSubAccountAmount;
      const remainingBalanceAfter = Number(
        (existing.total - subAccountAmount).toFixed(2),
      );
      settlesSplit = remainingBalanceAfter <= 0.05;

      childRawItems = [
        ...coreSubRawItems.map((item) => ({
          ...item,
          id: undefined,
          isSentToKitchen: false,
          sentAt: undefined,
          kitchenStatus: undefined,
        })),
        ...supplementalRawItems,
      ];

      const creditItem: CartItemEntity = {
        name: `Abono subcuenta (${dto.accountName})`,
        price: -Math.abs(
          settlesSplit
            ? Math.max(
                0,
                (existing.subTotal ?? subBaseSubtotal) -
                  (existing.discountAmount ?? 0),
              )
            : subBaseSubtotal,
        ),
        size: 'único',
        quantity: 1,
        giftQuantity: 0,
        extras: [],
        isSentToKitchen: false,
      };
      remainingParentItems = [...existing.items, creditItem];
    }

    const normalizedChildItems =
      await this.pricing.normalizeComboItems(childRawItems);
    const hasExplicitChildPromotion =
      dto.promotionSource !== undefined ||
      dto.cuponId !== undefined ||
      dto.discountId !== undefined ||
      dto.happyHourId !== undefined ||
      Boolean(dto.promotionCode?.trim());
    const childPromotion =
      dto.mode === 'items'
        ? await this.pricing.resolvePromotion(
            dto,
            {
              cuponId: existing.cuponId,
              discountId: existing.discountId,
              happyHourId: existing.happyHourId,
            },
            existing.timestamp,
          )
        : await this.pricing.resolvePromotion(
            dto,
            undefined,
            existing.timestamp,
          );

    const explicitPromotionMatchesParent =
      (childPromotion.source === 'coupon' &&
        childPromotion.cuponId === existing.cuponId) ||
      (childPromotion.source === 'discount' &&
        childPromotion.discountId === existing.discountId) ||
      (childPromotion.source === 'happy-hour' &&
        childPromotion.happyHourId === existing.happyHourId);
    const usesParentDiscountPool =
      dto.mode === 'items' &&
      (!hasExplicitChildPromotion || explicitPromotionMatchesParent);

    const unadjustedChild = await this.pricing.calculateWithPrices(
      normalizedChildItems,
      childPromotion,
    );
    const useChildDiscountOverride =
      usesParentDiscountPool &&
      typeof dto.discountAmount === 'number' &&
      dto.discountAmount >= 0 &&
      ((childPromotion.source === 'none' && dto.discountAmount > 0) ||
        (childPromotion.source !== 'none' &&
          Math.abs(unadjustedChild.totals.discountAmount - dto.discountAmount) >
            0.01));
    if (
      usesParentDiscountPool &&
      typeof dto.discountAmount === 'number' &&
      dto.discountAmount - (existing.discountAmount ?? 0) > 0.01
    ) {
      throw new BadRequestException(
        'El descuento de la subcuenta supera el descuento pendiente de la orden.',
      );
    }
    const { items: pricedChildItems, totals: childTotals } =
      useChildDiscountOverride
        ? await this.pricing.applyDiscountOverride(
            unadjustedChild,
            dto.discountAmount ?? 0,
          )
        : unadjustedChild;

    const reconciledDtoPayments = this.reconcileSplitPayments(
      dto.payments,
      childTotals.total,
      dto.finalTotal,
    );
    const resolvedPayments = await this.resolvePayments(reconciledDtoPayments);
    assertPaymentsMatchTotal(childTotals.total, resolvedPayments ?? []);

    const parentPromotion = await this.pricing.resolvePromotion(
      {},
      {
        cuponId: existing.cuponId,
        discountId: existing.discountId,
        happyHourId: existing.happyHourId,
      },
      existing.timestamp,
    );
    const unadjustedParent = await this.pricing.calculateWithPrices(
      remainingParentItems,
      parentPromotion,
    );
    const expectedRemainingDiscount =
      dto.mode === 'items' && usesParentDiscountPool
        ? Math.max(
            0,
            Number(
              (
                (existing.discountAmount ?? 0) - childTotals.discountAmount
              ).toFixed(2),
            ),
          )
        : (existing.discountAmount ?? 0);
    const useParentDiscountOverride =
      typeof existing.discountAmount === 'number' &&
      existing.discountAmount > 0 &&
      ((parentPromotion.source === 'none' && expectedRemainingDiscount > 0) ||
        (parentPromotion.source !== 'none' &&
          expectedRemainingDiscount + 0.01 <
            unadjustedParent.totals.discountAmount));
    const { items: pricedParentItems, totals: parentTotals } =
      useParentDiscountOverride
        ? await this.pricing.applyDiscountOverride(
            unadjustedParent,
            expectedRemainingDiscount,
          )
        : unadjustedParent;
    const finalParentItems = settlesSplit
      ? this.ensureKitchenItemsSentOnSettlement(pricedParentItems, nowMs)
      : pricedParentItems;

    const pendingParentCertificateSerials =
      this.extractCertificateSerials(finalParentItems);
    const childCertificateSerials = this.extractCertificateSerials(
      pricedChildItems,
      settlesSplit
        ? [
            ...(dto.certificateSerials ?? []),
            ...pendingParentCertificateSerials,
          ]
        : dto.certificateSerials,
    );
    const parentCertificateSerials = settlesSplit
      ? []
      : pendingParentCertificateSerials;
    const parentCuponId =
      parentPromotion.source === 'coupon' ? parentPromotion.cuponId : null;
    const effectiveChildPromotion =
      childPromotion.source === 'none' &&
      settlesSplit &&
      !hasExplicitChildPromotion &&
      parentPromotion.source === 'coupon'
        ? parentPromotion
        : childPromotion;
    const childCuponId =
      effectiveChildPromotion.source === 'coupon'
        ? effectiveChildPromotion.cuponId
        : undefined;

    await this.assertPendingBenefitsAvailable({
      cuponId:
        childCuponId !== undefined && childCuponId !== existing.cuponId
          ? childCuponId
          : undefined,
      certificateSerials: childCertificateSerials,
      excludeOrderId: existing.id,
    });

    const customerSnapshotName =
      dto.customerSnapshotName ||
      existing.customerSnapshotName ||
      (dto.customerPhone ? `Cliente ${dto.customerPhone}` : undefined);
    const cashierSnapshotName = existing.cashierSnapshotName || user?.username;
    const { customerId, cashierId, shiftId } =
      await this.referenceResolver.resolve({
        customerId: dto.customerId ?? existing.customerId,
        customerSnapshotName,
        customerPhone: dto.customerPhone ?? existing.customerPhone,
        customerAddress: dto.customerAddress ?? existing.customerAddress,
        cashierId: user?.id,
        cashierSnapshotName,
      });

    const nextParentStatus = settlesSplit
      ? OrderStatusDto.paid
      : this.deriveGlobalStatus(finalParentItems, existing.orderType);

    const { paidOrder, parentOrder } = await this.prisma.$transaction(
      async (tx) => {
        await this.lockUnchangedSplitParent(tx, existing);
        const sharesParentCoupon =
          childCuponId !== undefined && childCuponId === parentCuponId;
        const recordedSiblingCount = sharesParentCoupon
          ? await tx.order.count({
              where: {
                parentOrderId: existing.id,
                status: 'PAID',
                cuponId: childCuponId,
                couponConsumptionRecorded: true,
              },
            })
          : 0;
        const updatedParent = await this.repo.update(
          existing.id,
          {
            items: finalParentItems,
            total: parentTotals.total,
            subTotal: parentTotals.subTotal,
            discountAmount: parentTotals.discountAmount,
            taxAmount: parentTotals.taxAmount,
            cuponId: parentCuponId,
            discountId:
              parentPromotion.source === 'discount'
                ? parentPromotion.discountId
                : null,
            happyHourId:
              parentPromotion.source === 'happy-hour'
                ? parentPromotion.happyHourId
                : null,
            status: nextParentStatus,
            paidAt: settlesSplit ? new Date(nowMs) : undefined,
            isSentToKitchen: finalParentItems.some(
              (item) =>
                requiresKitchenPreparation(item) && item.isSentToKitchen,
            ),
            certificateSerials: parentCertificateSerials,
          },
          tx,
        );

        const createdChild = await this.repo.create(
          {
            shiftId,
            customerId: customerId ?? existing.customerId,
            items: pricedChildItems,
            subTotal: childTotals.subTotal,
            discountAmount: childTotals.discountAmount,
            taxAmount: childTotals.taxAmount,
            total: childTotals.total,
            timestamp: new Date(nowMs),
            status: OrderStatusDto.pending,
            customerSnapshotName,
            cashierId: cashierId ?? user?.id,
            cashierSnapshotName,
            orderType: dto.orderType ?? existing.orderType,
            customerAddress: dto.customerAddress ?? existing.customerAddress,
            linkedTables: existing.linkedTables,
            isSentToKitchen: pricedChildItems.some(
              (item) =>
                requiresKitchenPreparation(item) && item.isSentToKitchen,
            ),
            cuponId: childCuponId,
            discountId:
              effectiveChildPromotion.source === 'discount'
                ? effectiveChildPromotion.discountId
                : undefined,
            happyHourId:
              effectiveChildPromotion.source === 'happy-hour'
                ? effectiveChildPromotion.happyHourId
                : undefined,
            payments: resolvedPayments,
            certificateSerials: childCertificateSerials,
            parentOrderId: existing.id,
            splitAccountName: dto.accountName.trim(),
            splitMode: dto.mode,
          },
          tx,
        );

        await this.finalization.issueInTransaction(tx, {
          orderId: createdChild.id,
          dto: {
            ...dto,
            ...(customerId ? { customerId } : {}),
            customerSnapshotName,
            payments: resolvedPayments,
            certificateSerials: childCertificateSerials,
          },
          totals: childTotals,
          promotion: effectiveChildPromotion,
          skipCouponConsumption: sharesParentCoupon && recordedSiblingCount > 0,
        });

        const finalizedChild = await this.repo.findById(createdChild.id, tx);
        if (!finalizedChild) {
          throw new NotFoundException(
            'No se pudo cargar la orden de la subcuenta.',
          );
        }

        return {
          paidOrder: finalizedChild,
          parentOrder: updatedParent,
        };
      },
    );

    this.publishOrder(parentOrder, 'updated');
    this.publishOrder(paidOrder, 'created');
    return { paidOrder, parentOrder };
  }

  private async finalizeSplitParent(
    existing: OrderEntity,
    dto: SplitOrderCheckoutDto,
    user: AuthenticatedUser | undefined,
    rawItems: CartItemEntity[],
  ): Promise<{ paidOrder: OrderEntity; parentOrder: OrderEntity }> {
    const normalizedItems = await this.pricing.normalizeComboItems(rawItems);
    const hasExplicitPromotionSelection =
      dto.promotionSource !== undefined ||
      dto.cuponId !== undefined ||
      dto.discountId !== undefined ||
      dto.happyHourId !== undefined ||
      Boolean(dto.promotionCode?.trim());
    const promotion = await this.pricing.resolvePromotion(
      dto,
      {
        cuponId: existing.cuponId,
        discountId: existing.discountId,
        happyHourId: existing.happyHourId,
      },
      existing.timestamp,
    );
    const { items: rawPricedItems, totals } =
      !hasExplicitPromotionSelection &&
      typeof existing.discountAmount === 'number'
        ? await this.pricing.calculateWithPrices(
            normalizedItems,
            promotion,
            existing.discountAmount,
          )
        : await this.pricing.calculateWithPrices(normalizedItems, promotion);
    const pricedItems = this.ensureKitchenItemsSentOnSettlement(
      rawPricedItems,
      Date.now(),
    );
    const certificateSerials = this.extractCertificateSerials(
      pricedItems,
      dto.certificateSerials,
    );
    await this.assertPendingBenefitsAvailable({
      cuponId: promotion.source === 'coupon' ? promotion.cuponId : undefined,
      certificateSerials,
      excludeOrderId: existing.id,
    });

    const customerSnapshotName =
      dto.customerSnapshotName ||
      existing.customerSnapshotName ||
      (dto.customerPhone ? `Cliente ${dto.customerPhone}` : undefined);
    const cashierSnapshotName = existing.cashierSnapshotName || user?.username;
    const { customerId } = await this.referenceResolver.resolve({
      customerId: dto.customerId ?? existing.customerId,
      customerSnapshotName,
      customerPhone: dto.customerPhone ?? existing.customerPhone,
      customerAddress: dto.customerAddress ?? existing.customerAddress,
      cashierId: user?.id,
      cashierSnapshotName,
    });
    const reconciledPayments = this.reconcileSplitPayments(
      dto.payments ?? [],
      totals.total,
      dto.finalTotal,
    );
    const resolvedPayments = await this.resolvePayments(reconciledPayments);
    assertPaymentsMatchTotal(totals.total, resolvedPayments ?? []);

    const finalized = await this.prisma.$transaction(async (tx) => {
      await this.lockUnchangedSplitParent(tx, existing);
      await this.repo.update(
        existing.id,
        {
          items: pricedItems,
          total: totals.total,
          subTotal: totals.subTotal,
          discountAmount: totals.discountAmount,
          taxAmount: totals.taxAmount,
          cuponId: promotion.source === 'coupon' ? promotion.cuponId : null,
          discountId:
            promotion.source === 'discount' ? promotion.discountId : null,
          happyHourId:
            promotion.source === 'happy-hour' ? promotion.happyHourId : null,
          isSentToKitchen: pricedItems.some(
            (item) => requiresKitchenPreparation(item) && item.isSentToKitchen,
          ),
          certificateSerials,
        },
        tx,
      );
      await this.finalization.issueInTransaction(tx, {
        orderId: existing.id,
        dto: {
          ...dto,
          ...(customerId ? { customerId } : {}),
          customerSnapshotName,
          payments: resolvedPayments,
          certificateSerials,
        },
        totals,
        promotion,
      });
      const paidParent = await this.repo.findById(existing.id, tx);
      if (!paidParent) {
        throw new NotFoundException('No se pudo cargar la orden cobrada.');
      }
      return paidParent;
    });

    this.publishOrder(finalized, 'updated');
    return { paidOrder: finalized, parentOrder: finalized };
  }

  private async prepareSplitCancellationRestore(child: OrderEntity): Promise<
    | {
        parent: OrderEntity;
        update: Parameters<IOrdersRepository['update']>[1];
      }
    | undefined
  > {
    if (!child.parentOrderId || !child.splitMode) return undefined;
    const parent = await this.repo.findById(child.parentOrderId);
    if (
      !parent ||
      (parent.status === OrderStatusDto.paid && Boolean(parent.invoice)) ||
      parent.status === OrderStatusDto.cancelled
    ) {
      return undefined;
    }

    let restoredItems: CartItemEntity[];
    let restoredDiscount = parent.discountAmount ?? 0;
    if (child.splitMode === 'items') {
      const productItems = child.items
        .filter(
          (item) =>
            !isPackagingOrderItem(item) &&
            !isDeliveryChargeOrderItem(item) &&
            !isSplitBillOrderItem(item),
        )
        .map((item) => ({ ...item, id: undefined }));
      restoredItems = [...parent.items, ...productItems];
      const sharesParentPromotion =
        child.cuponId === parent.cuponId &&
        child.discountId === parent.discountId &&
        child.happyHourId === parent.happyHourId;
      if (sharesParentPromotion) {
        restoredDiscount += child.discountAmount ?? 0;
      }
    } else {
      const expectedCreditName =
        `abono subcuenta (${child.splitAccountName ?? ''})`
          .trim()
          .toLocaleLowerCase('es');
      const matchingCredits = [...parent.items]
        .map((item, index) => ({ item, index }))
        .filter(
          ({ item }) =>
            isSplitBillCreditOrderItem(item) &&
            item.name.trim().toLocaleLowerCase('es') === expectedCreditName,
        );
      const expectedCreditAmount = Math.abs(child.subTotal ?? child.total);
      const creditIndex =
        [...matchingCredits]
          .reverse()
          .find(
            ({ item }) =>
              Math.abs(Math.abs(item.price) - expectedCreditAmount) <= 0.02,
          )?.index ?? matchingCredits.at(-1)?.index;
      if (creditIndex === undefined) {
        throw new ConflictException(
          'No se encontró el abono correspondiente en la orden principal.',
        );
      }
      restoredItems = parent.items.filter((_, index) => index !== creditIndex);
    }

    const promotion = await this.pricing.resolvePromotion(
      {},
      {
        cuponId: parent.cuponId,
        discountId: parent.discountId,
        happyHourId: parent.happyHourId,
      },
      parent.timestamp,
    );
    const normalizedItems =
      await this.pricing.normalizeComboItems(restoredItems);
    const { items, totals } = await this.pricing.calculateWithPrices(
      normalizedItems,
      promotion,
      restoredDiscount,
    );
    return {
      parent,
      update: {
        items,
        total: totals.total,
        subTotal: totals.subTotal,
        discountAmount: totals.discountAmount,
        taxAmount: totals.taxAmount,
        status: this.deriveGlobalStatus(items, parent.orderType),
        paidAt: null,
        certificateSerials: this.extractCertificateSerials(items),
      },
    };
  }

  private ensureKitchenItemsSentOnSettlement(
    items: readonly CartItemEntity[],
    nowMs: number,
  ): CartItemEntity[] {
    return items.map((item) => {
      if (!requiresKitchenPreparation(item)) {
        return {
          ...item,
          isSentToKitchen: false,
          sentAt: undefined,
          kitchenStatus: undefined,
        };
      }
      if (item.isSentToKitchen) {
        return item;
      }
      return {
        ...item,
        isSentToKitchen: true,
        sentAt: item.sentAt ?? nowMs,
        kitchenStatus: item.kitchenStatus ?? KitchenStatusDto.pending,
      };
    });
  }

  private async lockUnchangedSplitParent(
    tx: Prisma.TransactionClient,
    existing: OrderEntity,
    allowSettledAggregate = false,
  ): Promise<void> {
    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        status: string;
        updatedAt: Date;
        invoiceNumber: string | null;
      }>
    >`
      SELECT id, status, "updatedAt", "invoiceNumber"
      FROM "Order"
      WHERE id = ${existing.id}
      FOR UPDATE
    `;
    const locked = rows[0];
    if (!locked) throw new NotFoundException('Orden no encontrada');
    const isAllowedPaidAggregate =
      allowSettledAggregate &&
      locked.status === 'PAID' &&
      !locked.invoiceNumber;
    if (
      locked.status === 'CANCELLED' ||
      (locked.status === 'PAID' && !isAllowedPaidAggregate)
    ) {
      throw new ConflictException('La orden ya fue cobrada o anulada.');
    }
    if (
      !existing.updatedAt ||
      locked.updatedAt.getTime() !== existing.updatedAt.getTime()
    ) {
      throw new ConflictException(
        'La orden cambió mientras se procesaba la subcuenta. Actualiza la mesa e inténtalo nuevamente.',
      );
    }
  }

  private subtractSubAccountItems(
    parentItems: readonly CartItemEntity[],
    subItems: readonly CartItemEntity[],
    nowMs: number,
  ): {
    remainingParentItems: CartItemEntity[];
    matchedCoreItems: CartItemEntity[];
  } {
    const pool: CartItemEntity[] = parentItems.map((item) => ({
      ...item,
      extras: [...(item.extras ?? [])],
    }));
    const matchedCoreItems: CartItemEntity[] = [];

    for (const subItem of subItems) {
      let qtyNeeded = subItem.quantity;
      let giftNeeded = Math.max(0, subItem.giftQuantity ?? 0);

      const candidates = pool.filter((candidate) => {
        if (candidate.quantity <= 0 || isSplitBillOrderItem(candidate)) {
          return false;
        }
        if (subItem.id !== undefined && candidate.id === subItem.id) {
          return true;
        }
        return (
          candidate.name.toLowerCase() === subItem.name.toLowerCase() &&
          candidate.size.toLowerCase() === subItem.size.toLowerCase() &&
          Math.abs(candidate.price - subItem.price) < 0.01 &&
          JSON.stringify(candidate.extras ?? []) ===
            JSON.stringify(subItem.extras ?? [])
        );
      });

      candidates.sort((a, b) => {
        const aExact = subItem.id !== undefined && a.id === subItem.id ? 0 : 1;
        const bExact = subItem.id !== undefined && b.id === subItem.id ? 0 : 1;
        return aExact - bExact;
      });

      for (const candidate of candidates) {
        if (qtyNeeded <= 0) break;
        const takeQty = Math.min(qtyNeeded, candidate.quantity);
        const takeGift = Math.min(
          giftNeeded,
          candidate.giftQuantity ?? 0,
          takeQty,
        );

        candidate.quantity -= takeQty;
        candidate.giftQuantity = Math.max(
          0,
          (candidate.giftQuantity ?? 0) - takeGift,
        );
        if (candidate.giftReason === 'happy-hour-2x1') {
          candidate.giftQuantity = Math.min(
            candidate.giftQuantity,
            Math.floor(candidate.quantity / 2),
          );
          if (candidate.giftQuantity === 0) {
            candidate.giftReason = undefined;
            if (candidate.note === '2x1 Happy Hour') {
              candidate.note = undefined;
            }
          }
        }

        const isKitchen = requiresKitchenPreparation(candidate);
        const resolvedChildGiftReason =
          candidate.giftReason === 'happy-hour-2x1' ||
          subItem.giftReason === 'happy-hour-2x1'
            ? takeGift > 0 && Math.floor(takeQty / 2) >= takeGift
              ? 'happy-hour-2x1'
              : undefined
            : (subItem.giftReason ?? candidate.giftReason);
        const resolvedChildGiftQty =
          resolvedChildGiftReason === 'happy-hour-2x1'
            ? Math.min(takeGift, Math.floor(takeQty / 2))
            : takeGift;

        matchedCoreItems.push({
          ...candidate,
          ...subItem,
          id: undefined,
          productId: subItem.productId ?? candidate.productId,
          categoryId: subItem.categoryId ?? candidate.categoryId,
          kitchenId: subItem.kitchenId ?? candidate.kitchenId,
          isCombo: subItem.isCombo ?? candidate.isCombo,
          comboSelections: subItem.comboSelections ?? candidate.comboSelections,
          kitchenModifiers:
            subItem.kitchenModifiers ?? candidate.kitchenModifiers,
          quantity: takeQty,
          giftQuantity: resolvedChildGiftQty,
          giftReason: resolvedChildGiftReason,
          note:
            resolvedChildGiftQty === 0 &&
            (subItem.note ?? candidate.note) === '2x1 Happy Hour'
              ? undefined
              : (subItem.note ?? candidate.note),
          isSentToKitchen: isKitchen ? true : false,
          sentAt: isKitchen ? (candidate.sentAt ?? nowMs) : undefined,
          kitchenStatus: isKitchen
            ? (candidate.kitchenStatus ?? KitchenStatusDto.pending)
            : undefined,
        });

        qtyNeeded -= takeQty;
        giftNeeded -= takeGift;
      }

      if (qtyNeeded > 0 || giftNeeded > 0) {
        throw new BadRequestException(
          `La cantidad o regalía seleccionada de ${subItem.name} supera la disponible en la orden.`,
        );
      }
    }

    return {
      remainingParentItems: pool.filter((item) => item.quantity > 0),
      matchedCoreItems,
    };
  }

  private reconcileSplitPayments(
    payments: OrderPaymentDto[],
    targetTotal: number,
    clientTotal?: number,
  ): OrderPaymentDto[] {
    if (!payments.length) return payments;
    const paidSum = payments.reduce((sum, p) => sum + p.amount, 0);
    if (clientTotal !== undefined && Math.abs(paidSum - clientTotal) >= 0.02) {
      return payments;
    }
    const delta = Number((targetTotal - paidSum).toFixed(2));
    if (Math.abs(delta) < 0.01 || Math.abs(delta) > 1) {
      return payments;
    }
    const adjustIdx = [...payments]
      .map((payment, idx) => ({ payment, idx }))
      .reverse()
      .find(({ payment }) => payment.amount + delta > 0)?.idx;
    if (adjustIdx === undefined) return payments;
    return payments.map((payment, idx) =>
      idx === adjustIdx
        ? {
            ...payment,
            amount: Number((payment.amount + delta).toFixed(2)),
          }
        : payment,
    );
  }

  private assertSplitBillCreditsUnchanged(
    existingItems: readonly CartItemEntity[],
    incomingItems: readonly CartItemEntity[],
  ): void {
    const existingCredits = existingItems.filter(isSplitBillCreditOrderItem);
    const incomingCredits = incomingItems.filter(isSplitBillCreditOrderItem);
    if (existingCredits.length !== incomingCredits.length) {
      throw new BadRequestException(
        'Los abonos de subcuenta no se pueden agregar ni eliminar al editar una orden.',
      );
    }

    const incomingById = new Map(
      incomingCredits.flatMap((item) =>
        item.id === undefined ? [] : [[item.id, item] as const],
      ),
    );
    for (const credit of existingCredits) {
      const incoming =
        credit.id === undefined ? undefined : incomingById.get(credit.id);
      const unchanged =
        incoming !== undefined &&
        incoming.productId === undefined &&
        incoming.name === credit.name &&
        incoming.price === credit.price &&
        incoming.size === credit.size &&
        incoming.quantity === 1 &&
        credit.quantity === 1 &&
        (incoming.giftQuantity ?? 0) === 0 &&
        incoming.extras.length === 0;
      if (!unchanged) {
        throw new BadRequestException(
          'Los abonos de subcuenta no se pueden modificar al editar una orden.',
        );
      }
    }
  }

  private extractCertificateSerials(
    items: readonly CartItemEntity[],
    explicitSerials?: readonly string[],
  ): string[] {
    const fromItems = items.flatMap((item) => {
      const note = item.note?.trim();
      if (!note || !note.toLowerCase().startsWith('vale:')) return [];
      return [note.slice('vale:'.length).trim()];
    });
    const raw =
      explicitSerials !== undefined
        ? [...explicitSerials, ...fromItems]
        : fromItems;
    return Array.from(
      new Set(
        raw
          .map((serial) => serial.trim().toUpperCase())
          .filter((serial) => serial.length > 0),
      ),
    ).sort();
  }

  private async assertPendingBenefitsAvailable(params: {
    cuponId?: number;
    certificateSerials: readonly string[];
    excludeOrderId?: string;
  }): Promise<void> {
    if (params.certificateSerials.length > 0) {
      const certificates = await this.prisma.certificado.findMany({
        where: {
          serial: { in: [...params.certificateSerials] },
          deletedAt: null,
        },
        select: { serial: true, status: true },
      });
      const bySerial = new Map(
        certificates.map((cert) => [cert.serial.toUpperCase(), cert.status]),
      );
      for (const serial of params.certificateSerials) {
        const status = bySerial.get(serial);
        if (!status) {
          throw new BadRequestException(`Certificado no encontrado: ${serial}`);
        }
        if (status !== CertificadoStatus.DISPONIBLE) {
          throw new BadRequestException(
            `El certificado ${serial} no está disponible`,
          );
        }
      }

      const activeOrdersWithCerts = await this.prisma.order.findMany({
        where: {
          status: { notIn: ['PAID', 'CANCELLED'] },
          NOT: { pendingCertificateSerials: { equals: Prisma.DbNull } },
          ...(params.excludeOrderId
            ? { id: { not: params.excludeOrderId } }
            : {}),
        },
        select: { pendingCertificateSerials: true },
      });

      const reservedSerials = new Set(
        activeOrdersWithCerts.flatMap((order) =>
          Array.isArray(order.pendingCertificateSerials)
            ? order.pendingCertificateSerials
                .filter((s): s is string => typeof s === 'string')
                .map((s) => s.trim().toUpperCase())
            : [],
        ),
      );

      for (const serial of params.certificateSerials) {
        if (reservedSerials.has(serial)) {
          throw new BadRequestException(
            `El certificado ${serial} ya está reservado en otra orden en curso.`,
          );
        }
      }
    }

    if (params.cuponId !== undefined) {
      const coupon = await this.prisma.cupon.findUnique({
        where: { id: params.cuponId },
        select: { maxUses: true, currentUses: true, deletedAt: true },
      });
      if (!coupon || coupon.deletedAt) {
        throw new BadRequestException('Cupón no encontrado');
      }
      if (coupon.maxUses > 0) {
        const reservedCouponCount = await this.prisma.order.count({
          where: {
            cuponId: params.cuponId,
            status: { notIn: ['PAID', 'CANCELLED'] },
            ...(params.excludeOrderId
              ? { id: { not: params.excludeOrderId } }
              : {}),
          },
        });
        if (coupon.currentUses + reservedCouponCount >= coupon.maxUses) {
          throw new BadRequestException(
            'El cupón agotó su cantidad de usos (incluyendo órdenes en curso).',
          );
        }
      }
    }
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
      const rawReference = payment.reference?.trim();
      const reference =
        configured.type === 'CARD_POS' && rawReference
          ? normalizePosReference(rawReference)
          : rawReference;
      if (
        configured.type === 'CARD_POS' &&
        !isValidPosReference(reference ?? '')
      ) {
        throw new BadRequestException(
          `${configured.name} requiere el código de autorización o referencia del voucher: 4 a 20 caracteres alfanuméricos o guiones, con al menos un número.`,
        );
      }
      if (
        configured.type !== 'CARD_POS' &&
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
      const providedExchangeRate = Number(payment.exchangeRate);
      const exchangeRate =
        configured.currency === 'USD'
          ? providedExchangeRate > 0
            ? providedExchangeRate
            : Math.max(0.0001, Number(generalData?.exchangeRate) || 36.5)
          : 1;
      const providedOriginalAmount = Number(payment.originalAmount);
      const originalAmount =
        providedOriginalAmount > 0
          ? Math.round(providedOriginalAmount * 100) / 100
          : Math.round((amount / exchangeRate) * 100) / 100;

      return {
        ...payment,
        method: this.toLegacyPaymentMethod(configured),
        methodConfigId: configured.id,
        reference,
        methodSnapshotName: configured.name,
        methodType: configured.type,
        currency: configured.currency,
        originalAmount,
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
