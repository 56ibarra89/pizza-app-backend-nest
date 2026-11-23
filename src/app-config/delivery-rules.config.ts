export const DELIVERY_RULES_ID = 'delivery_rules';
export const DELIVERY_PRICES_ID = 'delivery_prices';

export function readDeliveryConfigRecord(
  value: unknown,
): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function readConfiguredDeliveryZones(rules: unknown): unknown[] {
  const { zones } = readDeliveryConfigRecord(rules);
  return Array.isArray(zones) ? zones : [];
}

export function usesDeliveryZonePricing(rules: unknown): boolean {
  return (
    readDeliveryConfigRecord(rules).useZonePricing === true ||
    readConfiguredDeliveryZones(rules).length > 0
  );
}

export function readActiveDeliveryZones(zones: readonly unknown[]) {
  return zones.map(readDeliveryConfigRecord).flatMap((zone) => {
    if (
      zone.isActive !== true ||
      typeof zone.id !== 'string' ||
      typeof zone.name !== 'string' ||
      typeof zone.price !== 'number' ||
      !Number.isFinite(zone.price) ||
      zone.price < 0 ||
      typeof zone.driverPayout !== 'number' ||
      !Number.isFinite(zone.driverPayout) ||
      zone.driverPayout < 0
    ) {
      return [];
    }
    return [
      {
        id: zone.id,
        name: zone.name,
        price: zone.price,
        driverPayout: zone.driverPayout,
      },
    ];
  });
}
