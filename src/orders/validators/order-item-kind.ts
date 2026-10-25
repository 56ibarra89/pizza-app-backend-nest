interface NamedOrderItem {
  name: string;
}

function normalizeItemName(item: NamedOrderItem): string {
  return item.name.trim().toLocaleLowerCase('es');
}

export function isPackagingOrderItem(item: NamedOrderItem): boolean {
  const name = normalizeItemName(item);
  return name === 'empaque' || name.startsWith('empaque ');
}

export function isDeliveryChargeOrderItem(item: NamedOrderItem): boolean {
  const name = normalizeItemName(item);
  return name === 'delivery' || name.startsWith('delivery ');
}

export function isSplitBillCreditOrderItem(item: NamedOrderItem): boolean {
  const name = normalizeItemName(item);
  return name === 'abono subcuenta' || name.startsWith('abono subcuenta ');
}

export function isSplitBillPartialPaymentItem(item: NamedOrderItem): boolean {
  const name = normalizeItemName(item);
  return name === 'pago parcial' || name.startsWith('pago parcial ');
}

export function isSplitBillOrderItem(item: NamedOrderItem): boolean {
  return (
    isSplitBillCreditOrderItem(item) || isSplitBillPartialPaymentItem(item)
  );
}

export function requiresKitchenPreparation(item: NamedOrderItem): boolean {
  return (
    !isPackagingOrderItem(item) &&
    !isDeliveryChargeOrderItem(item) &&
    !isSplitBillOrderItem(item)
  );
}
