import {
  CertificadoStatus,
  CuponDiscountType,
  CuponManualStatus,
  HappyHourPromotionType,
  PromoActiveStatus,
} from '@prisma/client';
import { Prisma } from '@prisma/client';

export type PromoStatusDto = 'Activo' | 'Inactivo';
export type CuponStatusDto = 'Activo' | 'Inactivo' | 'Agotado' | 'Vencido';

export function toDbPromoActiveStatus(status: PromoStatusDto): PromoActiveStatus {
  return status === 'Activo' ? PromoActiveStatus.ACTIVO : PromoActiveStatus.INACTIVO;
}

export function fromDbPromoActiveStatus(status: PromoActiveStatus): PromoStatusDto {
  return status === PromoActiveStatus.ACTIVO ? 'Activo' : 'Inactivo';
}

export type HappyHourPromotionTypeDto = '2x1' | 'porcentaje' | 'monto_fijo';

export function toDbHappyHourPromotionType(type: HappyHourPromotionTypeDto): HappyHourPromotionType {
  switch (type) {
    case '2x1':
      return HappyHourPromotionType.DOSXUNO;
    case 'porcentaje':
      return HappyHourPromotionType.PORCENTAJE;
    case 'monto_fijo':
      return HappyHourPromotionType.MONTO_FIJO;
  }
}

export function fromDbHappyHourPromotionType(type: HappyHourPromotionType): HappyHourPromotionTypeDto {
  switch (type) {
    case HappyHourPromotionType.DOSXUNO:
      return '2x1';
    case HappyHourPromotionType.PORCENTAJE:
      return 'porcentaje';
    case HappyHourPromotionType.MONTO_FIJO:
      return 'monto_fijo';
  }
}

export type DiscountTypeDto = 'porcentaje' | 'monto_fijo';

export function toDbDiscountType(type: DiscountTypeDto): CuponDiscountType {
  return type === 'porcentaje' ? CuponDiscountType.PORCENTAJE : CuponDiscountType.MONTO_FIJO;
}

export function fromDbDiscountType(type: CuponDiscountType): DiscountTypeDto {
  return type === CuponDiscountType.PORCENTAJE ? 'porcentaje' : 'monto_fijo';
}

export function toDbCuponManualStatus(status: PromoStatusDto): CuponManualStatus {
  return status === 'Activo' ? CuponManualStatus.ACTIVO : CuponManualStatus.INACTIVO;
}

export function fromDbCuponManualStatus(status: CuponManualStatus): PromoStatusDto {
  return status === CuponManualStatus.ACTIVO ? 'Activo' : 'Inactivo';
}

export type CertificadoStatusDto = 'Disponible' | 'Entregado' | 'Anulado';

export function fromDbCertificadoStatus(status: CertificadoStatus): CertificadoStatusDto {
  switch (status) {
    case CertificadoStatus.DISPONIBLE:
      return 'Disponible';
    case CertificadoStatus.ENTREGADO:
      return 'Entregado';
    case CertificadoStatus.ANULADO:
      return 'Anulado';
  }
}

/**
 * Convierte un Prisma.Decimal (o null) a number para la capa de presentación.
 */
export function decimalToNumber(value: Prisma.Decimal | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return value.toNumber();
}

export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

/**
 * Calcula el estado efectivo de un cupón.
 * Usa comparación de objetos Date para mayor precisión.
 */
export function computeCuponStatus(
  maxUses: number,
  currentUses: number,
  expiresDate: Date | null,
  manualStatus: PromoStatusDto,
  now = new Date(),
): CuponStatusDto {
  if (manualStatus === 'Inactivo') return 'Inactivo';

  const isExhausted = maxUses > 0 && currentUses >= maxUses;
  // Expira al inicio del día de la fecha límite (comparamos sólo la fecha)
  const isExpired = expiresDate !== null && expiresDate < now;

  if (isExhausted) return 'Agotado';
  if (isExpired) return 'Vencido';
  return 'Activo';
}

export function hydrateCuponDerivedFields(data: {
  discountType: DiscountTypeDto;
  discountValue: number;
  maxUses: number;
  currentUses: number;
  expiresDate: Date | null;
  manualStatus: PromoStatusDto;
  now?: Date;
}): { discount: string; usage: string; expires: string; status: CuponStatusDto } {
  const status = computeCuponStatus(
    data.maxUses,
    data.currentUses,
    data.expiresDate,
    data.manualStatus,
    data.now,
  );

  const discount =
    data.discountType === 'porcentaje'
      ? `${data.discountValue}%`
      : `C$${data.discountValue.toFixed(2)}`;

  const usage = data.maxUses === 0 ? `${data.currentUses} / ∞` : `${data.currentUses} / ${data.maxUses}`;

  const expires =
    data.expiresDate === null
      ? 'Sin límite'
      : data.expiresDate.toISOString().substring(0, 10);

  return { discount, usage, expires, status };
}

export function buildHappyHourDerivedFields(data: {
  daysOfWeek: string[];
  startMinutes: number;
  endMinutes: number;
  promotionType: HappyHourPromotionTypeDto;
  promotionValue: number | null;
  appliesTo?: string | null;
}): { days: string; time: string; promotion: string } {
  const days = data.daysOfWeek.join(', ');
  const time = `${minutesToTime(data.startMinutes)} - ${minutesToTime(data.endMinutes)}`;

  let promotion = '';
  if (data.promotionType === '2x1') promotion = data.appliesTo ? `2x1 en ${data.appliesTo}` : '2x1';
  else if (data.promotionType === 'porcentaje') promotion = `-${data.promotionValue}%`;
  else if (data.promotionType === 'monto_fijo') promotion = `-C$${data.promotionValue}`;

  return { days, time, promotion };
}

export function generateCertificadoSerial(prefix = 'VC', existing?: Set<string>): string {
  if (!existing) {
    const num = Math.floor(100000 + Math.random() * 900000);
    return `${prefix}-${num}`;
  }

  let serial: string;
  do {
    const num = Math.floor(100000 + Math.random() * 900000);
    serial = `${prefix}-${num}`;
  } while (existing.has(serial));

  return serial;
}
