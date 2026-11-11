import type { OrderEntity } from '../entities/order.entity';
import {
  isPackagingOrderItem,
  requiresKitchenPreparation,
} from '../validators/order-item-kind';

export function toOrderResponseDto(order: OrderEntity) {
  return {
    id: order.id,
    items: order.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      categoryId: i.categoryId,
      name: i.name,
      price: i.price,
      size: i.size,
      quantity: i.quantity,
      extras: i.extras.map((e) => ({ name: e.name, price: e.price })),
      note: i.note,
      kitchenModifiers: i.kitchenModifiers,
      giftQuantity: i.giftQuantity,
      giftReason: i.giftReason,
      isSentToKitchen: i.isSentToKitchen,
      sentAt: i.sentAt,
      kitchenStatus: i.kitchenStatus,
      kitchenId: i.kitchenId,
      isCombo: Boolean(i.isCombo),
      comboSelections: i.comboSelections,
    })),
    subTotal: order.subTotal,
    discountAmount: order.discountAmount,
    taxAmount: order.taxAmount,
    total: order.total,
    status: order.status,
    driverId: order.driverId,
    waiterId: order.waiterId,
    waiterSnapshotName: order.waiterSnapshotName,
    timestamp: order.timestamp.toISOString(),
    updatedAt: order.updatedAt?.toISOString(),
    paidAt: order.paidAt?.toISOString(),
    parentOrderId: order.parentOrderId,
    splitAccountName: order.splitAccountName,
    splitMode: order.splitMode,
    customerTendered: order.customerTendered,
    deliveryChange: order.deliveryChange,
    kitchenReadyAt: order.kitchenReadyAt?.toISOString(),
    deliveryStartedAt: order.deliveryStartedAt?.toISOString(),
    deliveredAt: order.deliveredAt?.toISOString(),
    customerSnapshotName: order.customerSnapshotName,
    customerPhone: order.customerPhone,
    customerId: order.customerId,
    orderType: order.orderType,
    customerAddress: order.customerAddress,
    cuponId: order.cuponId,
    discountId: order.discountId,
    happyHourId: order.happyHourId,
    certificateSerials: order.certificateSerials,
    promotionSource: order.cuponId
      ? 'coupon'
      : order.discountId
        ? 'discount'
        : order.happyHourId
          ? 'happy-hour'
          : 'none',
    payments: order.payments,
    cashierSnapshotName: order.cashierSnapshotName,
    cancelReason: order.cancelReason,
    cancellationReasonId: order.cancellationReasonId,
    cancellationReasonLabel: order.cancellationReasonLabel,
    cancellationCategory: order.cancellationCategory,
    cancellationCountsAsWaste: order.cancellationCountsAsWaste,
    cancellationWasPrepared: order.cancellationWasPrepared,
    cancellationRequiresSupervisor: order.cancellationRequiresSupervisor,
    cancellationLossAmount: order.cancellationLossAmount,
    cancelledById: order.cancelledById,
    cancelledAt: order.cancelledAt?.toISOString(),
    isSentToKitchen: order.isSentToKitchen,
    linkedTables: order.linkedTables,
    invoice: order.invoice
      ? {
          correlativoId: order.invoice.correlativoId,
          documentType: order.invoice.documentType,
          resolutionNumber: order.invoice.resolutionNumber,
          prefix: order.invoice.prefix,
          issuedNumber: order.invoice.issuedNumber,
          invoiceNumber: order.invoice.invoiceNumber,
          issuedAt: order.invoice.issuedAt.toISOString(),
        }
      : undefined,
  };
}

export function toKitchenOrderResponseDto(
  order: OrderEntity,
  kitchenId: string,
) {
  const items = order.items
    .filter(
      (item) =>
        requiresKitchenPreparation(item) &&
        (item.isCombo
          ? item.comboSelections?.some(
              (selection) => selection.kitchenId === kitchenId,
            )
          : item.kitchenId === kitchenId),
    )
    .map((item) => ({
      id: item.id,
      productId: item.productId,
      categoryId: item.categoryId,
      name: item.name,
      size: item.size,
      quantity: item.quantity,
      extras: item.extras.map((extra) => ({ name: extra.name })),
      note: item.note,
      kitchenModifiers: item.kitchenModifiers,
      giftQuantity: item.giftQuantity,
      giftReason: item.giftReason,
      isSentToKitchen: item.isSentToKitchen,
      sentAt: item.sentAt,
      kitchenStatus: item.kitchenStatus,
      kitchenId: item.isCombo ? undefined : item.kitchenId,
      isCombo: Boolean(item.isCombo),
      comboSelections: item.comboSelections
        ?.filter((selection) => selection.kitchenId === kitchenId)
        .map((selection) => ({
          groupId: selection.groupId,
          groupName: selection.groupName,
          productId: selection.productId,
          productName: selection.productName,
          size: selection.size,
          quantity: selection.quantity,
          extras: selection.extras?.map((extra) => ({ name: extra.name })),
          kitchenId: selection.kitchenId,
          categoryId: selection.categoryId,
          categoryName: selection.categoryName,
          kitchenStatus: selection.kitchenStatus,
        })),
    }));

  if (items.length === 0) return null;
  return {
    id: order.id,
    items,
    status: order.status,
    timestamp: order.timestamp.toISOString(),
    updatedAt: order.updatedAt?.toISOString(),
    orderType: order.orderType,
    customerSnapshotName: order.customerSnapshotName,
    linkedTables: order.linkedTables,
    isSentToKitchen: order.isSentToKitchen,
    packagingRequested: order.items.some(isPackagingOrderItem),
    invoice: order.invoice
      ? { invoiceNumber: order.invoice.invoiceNumber }
      : undefined,
  };
}
