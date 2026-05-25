import type { OrderEntity } from '../entities/order.entity';

export function toOrderResponseDto(order: OrderEntity) {
  return {
    id: order.id,
    items: order.items.map((i) => ({
      name: i.name,
      price: i.price,
      size: i.size,
      quantity: i.quantity,
      extras: i.extras.map((e) => ({ name: e.name, price: e.price })),
      note: i.note,
      giftQuantity: i.giftQuantity,
      isSentToKitchen: i.isSentToKitchen,
      sentAt: i.sentAt,
      kitchenStatus: i.kitchenStatus,
    })),
    subTotal: order.subTotal,
    discountAmount: order.discountAmount,
    taxAmount: order.taxAmount,
    total: order.total,
    status: order.status,
    timestamp: order.timestamp.toISOString(),
    customerSnapshotName: order.customerSnapshotName,
    orderType: order.orderType,
    customerAddress: order.customerAddress,
    cuponId: order.cuponId,
    payments: order.payments,
    cashierSnapshotName: order.cashierSnapshotName,
    cancelReason: order.cancelReason,
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
