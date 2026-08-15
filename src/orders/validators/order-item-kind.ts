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
  return normalizeItemName(item) === 'delivery';
}

export function requiresKitchenPreparation(item: NamedOrderItem): boolean {
  return !isPackagingOrderItem(item) && !isDeliveryChargeOrderItem(item);
}
