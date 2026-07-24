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
    const status =
      dto.status ??
      (dto.payments?.length ? OrderStatusDto.paid : OrderStatusDto.pending);
    const timestamp = dto.timestamp ?? new Date();
    const isSentToKitchen =
      dto.isSentToKitchen ??
      !(dto.linkedTables && dto.linkedTables.length > 0);

    const { customerId, cashierId, shiftId } =
      await this.referenceResolver.resolve(dto);
    const items = dto.items.map((item) => ({
      ...item,
      giftQuantity: item.giftQuantity ?? 0,
    }));
    const cuponId = await this.pricing.resolveCouponId(
      dto.cuponId,
      dto.promotionCode,
    );
    const totals = await this.pricing.calculate(
      items,
      cuponId,
      dto.discountAmount,
    );

    try {
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
        customerSnapshotName: dto.customerSnapshotName,
        cashierId,
        cashierSnapshotName: dto.cashierSnapshotName,
        orderType: dto.orderType,
        customerAddress: dto.customerAddress,
        linkedTables: dto.linkedTables,
        isSentToKitchen,
        cuponId,
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
            subTotal: totals.subTotal,
            taxAmount: totals.taxAmount,
            discountAmount: totals.discountAmount,
            finalTotal: totals.total,
            cuponId,
            promotionCode: dto.promotionCode,
            certificateSerials: dto.certificateSerials,
          }, 'system');
        } catch (error) {
          await this.repo.delete(created.id);
          throw error;
        }
      }

      return created;
    } catch (error) {
      throw error;
    }
  }

  async updateStatus(
    id: string,
    dto: UpdateOrderStatusDto,
    user?: AuthenticatedUser,
  ) {
    const existing = await this.getById(id);
    const isFinal = existing.status === OrderStatusDto.paid || existing.status === OrderStatusDto.cancelled;

    // Regla de Negocio: El COCINERO no puede cambiar estados financieros
    if (user?.role === UserRoleDto.cocinero) {
      if (dto.status === OrderStatusDto.paid || dto.status === OrderStatusDto.cancelled) {
        throw new ForbiddenException('Los cocineros no tienen permiso para cobrar o cancelar órdenes.');
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
      if (dto.status === OrderStatusDto.paid || dto.status === OrderStatusDto.cancelled) {
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
          targetUsername: reloaded.cashierSnapshotName,
        });
      }

      const derived = this.deriveGlobalStatus(reloaded.items);
      const nextGlobalStatus = (existing.status === OrderStatusDto.paid || existing.status === OrderStatusDto.cancelled) 
                               ? existing.status 
                               : derived;
      this.logger.debug(`Estado global derivado: ${nextGlobalStatus}`);
      return this.repo.update(id, { status: nextGlobalStatus });
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

    const nextStatus = dto.status;
    if (nextStatus === OrderStatusDto.paid && existing.status !== OrderStatusDto.paid) {
      assertPaymentsMatchTotal(existing.total, existing.payments);
    }

    const updateItemsKitchen = this.asKitchenStatusOrUndefined(nextStatus);
    this.logger.debug(
      `Actualizando items a kitchenStatus=${updateItemsKitchen}`,
    );

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
        targetUsername: existing.cashierSnapshotName,
      });
    }

    if (authorizerAdmin) {
      updateData.cancelReason = dto.cancelReason;
      updateData.cancelledById = authorizerAdmin.id;
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
    await this.tableAssignments.replace(id, tableIds);

    return this.getById(id);
  }

  async updateItems(id: string, dto: UpdateOrderItemsDto) {
    const existing = await this.getById(id);
    const isFinal = existing.status === OrderStatusDto.paid || existing.status === OrderStatusDto.cancelled;

    const mappedItems: CartItemEntity[] = dto.items.map((item) => ({
      ...item,
      giftQuantity: item.giftQuantity ?? 0,
    }));
    const nextStatus = isFinal
      ? existing.status
      : this.deriveGlobalStatus(mappedItems);

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
              targetUsername: existing.cashierSnapshotName,
            });
          }
        }
      }
    }

    const totals = await this.pricing.calculate(
      mappedItems,
      dto.cuponId,
      dto.discountAmount,
    );

    return this.repo.update(id, {
      items: mappedItems,
      total: totals.total,
      subTotal: totals.subTotal,
      discountAmount: totals.discountAmount,
      taxAmount: totals.taxAmount,
      cuponId: dto.cuponId,
      status: nextStatus,
      isSentToKitchen: dto.isSentToKitchen,
    });
  }

  async finalize(
    id: string,
    dto: FinalizeOrderDto,
    user?: AuthenticatedUser | string,
  ) {
    const existing = await this.getById(id);
    if (existing.status === OrderStatusDto.paid) return existing;

    await this.finalization.finalize(existing, dto, user);
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
