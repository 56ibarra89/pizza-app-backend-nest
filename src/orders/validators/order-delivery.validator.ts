import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UserRoleDto } from '../../common';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import type { CartItemEntity } from '../entities/order-item.entity';
import { isDeliveryChargeOrderItem } from './order-item-kind';
import {
  readActiveDeliveryZones,
  readConfiguredDeliveryZones,
  readDeliveryConfigRecord,
  usesDeliveryZonePricing,
} from '../../app-config/delivery-rules.config';

const toCents = (amount: number) => Math.round(amount * 100);

export function resolveDeliveryCharge(input: {
  items: CartItemEntity[];
  merchandiseTotal: number;
  rules: unknown;
  legacyPrices: unknown;
  zoneId?: string;
  overrideReason?: string;
  user?: AuthenticatedUser;
}) {
  const { items, merchandiseTotal, zoneId, user } = input;
  const rules = readDeliveryConfigRecord(input.rules);
  const configuredZones = readConfiguredDeliveryZones(rules);
  const zones = readActiveDeliveryZones(configuredZones);
  const hasConfiguredZones = usesDeliveryZonePricing(rules);
  const lines = items.filter(isDeliveryChargeOrderItem);
  const line = lines[0];
  if (
    lines.length !== 1 ||
    !line ||
    line.productId ||
    line.quantity !== 1 ||
    line.giftQuantity ||
    line.extras.length ||
    line.isCombo ||
    line.comboSelections?.length ||
    line.price < 0 ||
    !Number.isFinite(line.price) ||
    Math.abs(line.price * 100 - toCents(line.price)) > 1e-7
  ) {
    throw new BadRequestException('Selecciona una tarifa de envío válida.');
  }

  const overrideReason = input.overrideReason?.trim();
  if (input.overrideReason !== undefined && !overrideReason) {
    throw new BadRequestException('Indica el motivo de la tarifa manual.');
  }
  if (
    overrideReason &&
    user?.role !== UserRoleDto.admin &&
    user?.role !== UserRoleDto.cajero_principal
  ) {
    throw new ForbiddenException(
      'La tarifa manual requiere autorización de administración o caja principal.',
    );
  }

  const qualifies =
    rules.freeDeliveryEnabled === true &&
    typeof rules.freeDeliveryMinAmount === 'number' &&
    rules.freeDeliveryMinAmount > 0 &&
    toCents(merchandiseTotal) >= toCents(rules.freeDeliveryMinAmount);
  const legacy = readDeliveryConfigRecord(input.legacyPrices).prices;
  const legacyPrices = Array.isArray(legacy)
    ? legacy
        .filter(
          (price): price is string | number =>
            typeof price === 'string' || typeof price === 'number',
        )
        .map(Number)
        .filter((price) => Number.isFinite(price) && price > 0)
    : [];
  const amount = Number(line.price.toFixed(2));
  const matchingZones = zoneId
    ? []
    : zones.filter((candidate) =>
        qualifies
          ? zones.length === 1
          : toCents(candidate.price) === toCents(amount),
      );
  const zone = zoneId
    ? zones.find((candidate) => candidate.id === zoneId)
    : matchingZones.length === 1
      ? matchingZones[0]
      : undefined;
  if ((zoneId && !zone) || (hasConfiguredZones && !zone && !overrideReason)) {
    throw new BadRequestException(
      'Selecciona una zona de envío activa y vuelve a confirmar.',
    );
  }
  const expected = qualifies ? 0 : zone?.price;
  const configured =
    expected === undefined
      ? legacyPrices.some((price) => toCents(price) === toCents(amount))
      : toCents(expected) === toCents(amount) && (expected > 0 || qualifies);
  if (
    !overrideReason &&
    (!configured || (!zone && legacyPrices.length === 0))
  ) {
    throw new BadRequestException(
      'La tarifa de envío cambió o falta configurarla. Revisa el importe antes de confirmar.',
    );
  }

  const source = overrideReason
    ? 'manual'
    : qualifies
      ? 'promotion'
      : 'configured';
  const driverPayout =
    zone?.driverPayout ??
    (qualifies && !overrideReason ? (legacyPrices[0] ?? 0) : amount);
  const note = [
    zone && `Zona: ${zone.name}`,
    `Pago Motorizado: C$${driverPayout.toFixed(2)}`,
    source === 'promotion' && 'Envío Gratis por Consumo Mínimo',
    source === 'manual' && 'Tarifa manual autorizada',
  ]
    .filter(Boolean)
    .join(' | ');

  return {
    items: items.map((item) =>
      item === line
        ? {
            ...item,
            price: amount,
            name: amount === 0 ? 'Delivery (Envío Gratis)' : 'Delivery',
            note,
          }
        : item,
    ),
    source,
    amount,
    driverPayout,
    zoneId: zone?.id ?? null,
    zoneName: zone?.name ?? null,
    overrideReason: overrideReason ?? null,
    merchandiseTotal,
  };
}
