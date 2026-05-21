import {
  CertificadoStatus,
  CuponDiscountType,
  CuponManualStatus,
  HappyHourPromotionType,
  PromoActiveStatus,
} from '@prisma/client';

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

function pad2(v: number): string {
  return String(v).padStart(2, '0');
}

export function todayLocalISO(now = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

export function computeCuponStatus(
  maxUses: number,
  currentUses: number,
  expiresDate: string,
  manualStatus: PromoStatusDto,
  now = new Date(),
): CuponStatusDto {
  if (manualStatus === 'Inactivo') return 'Inactivo';

  const isExhausted = maxUses > 0 && currentUses >= maxUses;
  const isExpired = expiresDate !== '' && expiresDate < todayLocalISO(now);

  if (isExhausted) return 'Agotado';
  if (isExpired) return 'Vencido';
  return 'Activo';
}

export function hydrateCuponDerivedFields(data: {
  discountType: DiscountTypeDto;
  discountValue: string;
  maxUses: number;
  currentUses: number;
  expiresDate: string;
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
      : `C$${Number.parseFloat(data.discountValue).toFixed(2)}`;

  const usage = data.maxUses === 0 ? `${data.currentUses} / ∞` : `${data.currentUses} / ${data.maxUses}`;
  const expires = data.expiresDate === '' ? 'Sin límite' : data.expiresDate;

  return { discount, usage, expires, status };
}

export function buildHappyHourDerivedFields(data: {
  daysOfWeek: string[];
  startTime: string;
  endTime: string;
  promotionType: HappyHourPromotionTypeDto;
  promotionValue: string;
  appliesTo?: string | null;
}): { days: string; time: string; promotion: string } {
  const days = data.daysOfWeek.join(', ');
  const time = `${data.startTime} - ${data.endTime}`;

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
