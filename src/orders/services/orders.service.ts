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
import { UserRoleDto } from '../../users/dto/user-role.dto';
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

  async create(dto: CreateOrderDto) {
    const isDelivery = dto.orderType === OrderTypeDto.delivery;
    const status = isDelivery
      ? OrderStatusDto.pending
      : (dto.status ??
        (dto.payments?.length ? OrderStatusDto.paid : OrderStatusDto.pending));
    const timestamp = dto.timestamp ?? new Date();
    const isSentToKitchen =
      dto.isSentToKitchen ?? !(dto.linkedTables && dto.linkedTables.length > 0);

    const { customerId, cashierId, shiftId } =
      await this.referenceResolver.resolve(dto);
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
      cashierSnapshotName: dto.cashierSnapshotName,
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
      payments: isDelivery || status === OrderStatusDto.paid ? undefined : dto.payments,
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
      } catch (error) {
        this.logger.error(
          `Error al generar factura para delivery ${created.id}: ${error?.message ?? error}`,
        );
      }
    }

    if (status === OrderStatusDto.paid) {
      try {
        const finalized = await this.finalize(
          created.id,
          {
            payments: dto.payments,
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

    const authorizerAdmin =
      dto.status === OrderStatusDto.cancelled
        ? await this.cancellationAuthorization.authorize(dto.adminPin)
        : undefined;
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

      const derived = this.deriveGlobalStatus(reloaded.items, reloaded.orderType);
      const nextGlobalStatus =
        existing.status === OrderStatusDto.paid ||
        existing.status === OrderStatusDto.cancelled
          ? existing.status
          : derived;
      this.logger.debug(`Estado global derivado: ${nextGlobalStatus}`);
      const updated = await this.repo.update(id, {
        status: nextGlobalStatus,
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
      nextStatus === OrderStatusDto.paid &&
      existing.status !== OrderStatusDto.paid
    ) {
      assertPaymentsMatchTotal(existing.total, existing.payments);
    }

    const updateItemsKitchen = this.asKitchenStatusOrUndefined(nextStatus);
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

    if (authorizerAdmin) {
      updateData.cancelReason = dto.cancelReason;
      updateData.cancelledById = authorizerAdmin.id;
      updateData.cancelledAt = new Date();

      // Send email to all admins
      const cashierName = user
        ? `${user.firstName || ''} ${user.lastName || ''}`.trim()
        : 'Desconocido';
      const adminName = authorizerAdmin
        ? `${authorizerAdmin.firstName || ''} ${authorizerAdmin.lastName || ''}`.trim()
        : 'Desconocido';
      const reasonStr = dto.cancelReason || 'No especificado';
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

    await this.finalization.finalize(existing, dto, user);
    const finalized = await this.getById(id);
    if (publishEvent) {
      this.publishOrder(finalized, 'updated');
    }
    return finalized;
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

