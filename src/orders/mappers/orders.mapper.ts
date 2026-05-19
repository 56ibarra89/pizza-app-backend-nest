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
    taxAmount: order.taxAmount,
    total: order.total,
    status: order.status,
    timestamp: order.timestamp.toISOString(),
    customerName: order.customerName,
    orderType: order.orderType,
    customerAddress: order.customerAddress,
    tableId: order.tableId,
    paymentMethod: order.paymentMethod,
    splitAmounts: order.splitAmounts,
    cashierName: order.cashierName,
    isSentToKitchen: order.isSentToKitchen,
    linkedTables: order.linkedTables,
  };
}
