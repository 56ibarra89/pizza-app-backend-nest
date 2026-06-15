import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { type Certificado, CertificadoStatus, CuponDiscountType, type Cupon } from '@prisma/client';
import {
  PROMOTIONS_REPOSITORY,
  type IPromotionsRepository,
  type HappyHourWithRelations,
  type DiscountWithRelations,
  type CertificadoWithRelations,
} from '../interfaces/promotions.repository';
import type { CreateHappyHourDto } from '../dto/happy-hours/create-happy-hour.dto';
import type { UpdateHappyHourDto } from '../dto/happy-hours/update-happy-hour.dto';
import type { CreateDiscountDto } from '../dto/discounts/create-discount.dto';
import type { UpdateDiscountDto } from '../dto/discounts/update-discount.dto';
import type { CreateCuponDto } from '../dto/cupones/create-cupon.dto';
import type { UpdateCuponDto } from '../dto/cupones/update-cupon.dto';
import type { RedeemCuponDto } from '../dto/cupones/redeem-cupon.dto';
import type { CreateCertificadoDto } from '../dto/certificados/create-certificado.dto';
import type { RedeemCertificadoDto } from '../dto/certificados/redeem-certificado.dto';
import {
  buildHappyHourDerivedFields,
  decimalToNumber,
  timeToMinutes,
  minutesToTime,
  fromDbCertificadoStatus,
  fromDbCuponManualStatus,
  fromDbDiscountType,
  fromDbHappyHourPromotionType,
  fromDbPromoActiveStatus,
  generateCertificadoSerial,
  hydrateCuponDerivedFields,
  toDbCuponManualStatus,
  toDbDiscountType,
  toDbHappyHourPromotionType,
  toDbPromoActiveStatus,
} from '../mappers/promotions.mapper';

@Injectable()
export class PromotionsService {
  constructor(@Inject(PROMOTIONS_REPOSITORY) private readonly repo: IPromotionsRepository) {}

  private mapCertificadoResponse(c: CertificadoWithRelations) {
    return {
      id: c.id,
      serial: c.serial,
      origin: c.origin,
      items: c.items.map(i => ({ productId: i.productId, quantity: i.quantity })),
      issueDate: c.issueDate.toISOString().substring(0, 10),
      redeemedAt: c.redeemedAt ? c.redeemedAt.toISOString() : undefined,
      description: c.description ?? undefined,
      status: fromDbCertificadoStatus(c.status),
      amount: c.amount ? decimalToNumber(c.amount) : undefined,
      redeemedOrderId: c.redeemedOrderId ?? undefined,
    };
  }

  // ── Happy Hours ─────────────────────────────────────────────────────────

  private mapHappyHour(h: HappyHourWithRelations) {
    const promotionType = fromDbHappyHourPromotionType(h.promotionType);
    const promotionValue = decimalToNumber(h.promotionValue);
    const startTime = minutesToTime(h.startMinutes);
    const endTime = minutesToTime(h.endMinutes);
    const derived = buildHappyHourDerivedFields({
      daysOfWeek: h.daysOfWeek,
      startMinutes: h.startMinutes,
      endMinutes: h.endMinutes,
      promotionType,
      promotionValue: h.promotionValue ? promotionValue : null,
      appliesTo: h.appliesTo,
    });

    return {
      id: h.id,
      name: h.name,
      daysOfWeek: h.daysOfWeek,
      startTime,
      endTime,
      promotionType,
      promotionValue: h.promotionValue ? promotionValue : null,
      status: fromDbPromoActiveStatus(h.status),
      appliesTo: h.appliesTo ?? undefined,
      productIds: h.products.map((p) => p.productId),
      categoryIds: h.categories.map((c) => c.categoryId),
      ...derived,
    };
  }

  private validateHappyHourTimes(startMinutes: number, endMinutes: number) {
    if (startMinutes < 0 || startMinutes > 1440) {
      throw new BadRequestException('Minutos de inicio inválidos (0-1440)');
    }
    if (endMinutes < 0 || endMinutes > 1440) {
      throw new BadRequestException('Minutos de fin inválidos (0-1440)');
    }
    if (endMinutes < startMinutes) {
      throw new BadRequestException('La hora de fin no puede ser anterior a la hora de inicio');
    }
  }

  async listHappyHours() {
    const list = await this.repo.listHappyHours();
    return list.map((h) => this.mapHappyHour(h));
  }

  async createHappyHour(dto: CreateHappyHourDto) {
    const startMinutes = timeToMinutes(dto.startTime);
    const endMinutes = timeToMinutes(dto.endTime);
    this.validateHappyHourTimes(startMinutes, endMinutes);

    const created = await this.repo.createHappyHour({
      name: dto.name,
      daysOfWeek: dto.daysOfWeek,
      startMinutes,
      endMinutes,
      promotionType: toDbHappyHourPromotionType(dto.promotionType),
      promotionValue: dto.promotionType === '2x1' ? null : (dto.promotionValue ?? null),
      status: toDbPromoActiveStatus(dto.status ?? 'Activo'),
      appliesTo: dto.promotionType === '2x1' ? (dto.appliesTo ?? null) : null,
      productIds: dto.productIds,
      categoryIds: dto.categoryIds,
    });

    return this.mapHappyHour(created);
  }

  async updateHappyHour(id: number, dto: UpdateHappyHourDto) {
    const existing = await this.repo.findHappyHourById(id);
    if (!existing) throw new NotFoundException('Regla Happy Hour no encontrada');

    const nextPromotionType = dto.promotionType ?? fromDbHappyHourPromotionType(existing.promotionType);

    const nextStartMinutes = dto.startTime !== undefined ? timeToMinutes(dto.startTime) : existing.startMinutes;
    const nextEndMinutes = dto.endTime !== undefined ? timeToMinutes(dto.endTime) : existing.endMinutes;
    this.validateHappyHourTimes(nextStartMinutes, nextEndMinutes);

    const updated = await this.repo.updateHappyHour(id, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.daysOfWeek !== undefined ? { daysOfWeek: dto.daysOfWeek } : {}),
      ...(dto.startTime !== undefined ? { startMinutes: nextStartMinutes } : {}),
      ...(dto.endTime !== undefined ? { endMinutes: nextEndMinutes } : {}),
      ...(dto.promotionType !== undefined ? { promotionType: toDbHappyHourPromotionType(dto.promotionType) } : {}),
      ...(dto.status !== undefined ? { status: toDbPromoActiveStatus(dto.status) } : {}),
      ...(dto.promotionValue !== undefined
        ? { promotionValue: nextPromotionType === '2x1' ? null : dto.promotionValue }
        : {}),
      ...(dto.appliesTo !== undefined
        ? { appliesTo: nextPromotionType === '2x1' ? dto.appliesTo : null }
        : {}),
      ...(dto.productIds !== undefined ? { productIds: dto.productIds } : {}),
      ...(dto.categoryIds !== undefined ? { categoryIds: dto.categoryIds } : {}),
    });

    return this.mapHappyHour(updated);
  }

  async deleteHappyHour(id: number) {
    const existing = await this.repo.findHappyHourById(id);
    if (!existing) return;
    await this.repo.deleteHappyHour(id);
  }

  // ── Discounts ──────────────────────────────────────────────────────────

  private mapDiscount(d: DiscountWithRelations) {
    const discountValue = decimalToNumber(d.discountValue);
    return {
      id: d.id,
      name: d.name,
      type: d.discountType === CuponDiscountType.PORCENTAJE ? 'Porcentaje' : 'Monto Fijo',
      value:
        d.discountType === CuponDiscountType.PORCENTAJE
          ? `${discountValue}%`
          : `C$${discountValue.toFixed(2)}`,
      discountValue,
      status: fromDbPromoActiveStatus(d.status),
      productIds: d.products.map((p) => p.productId),
      categoryIds: d.categories.map((c) => c.categoryId),
    };
  }

  private parseDiscountType(type: string): 'porcentaje' | 'monto_fijo' {
    return type.trim().toLowerCase() === 'porcentaje' ? 'porcentaje' : 'monto_fijo';
  }

  private validateDiscountValue(discountType: 'porcentaje' | 'monto_fijo', value: number) {
    if (value <= 0) {
      throw new BadRequestException('Valor de descuento inválido');
    }
    if (discountType === 'porcentaje' && value > 100) {
      throw new BadRequestException('El porcentaje no puede superar 100');
    }
  }

  async listDiscounts() {
    const list = await this.repo.listDiscounts();
    return list.map((d) => this.mapDiscount(d));
  }

  async createDiscount(dto: CreateDiscountDto) {
    const discountType = this.parseDiscountType(dto.type);
    this.validateDiscountValue(discountType, dto.value);

    const created = await this.repo.createDiscount({
      name: dto.name,
      discountType: toDbDiscountType(discountType),
      discountValue: dto.value,
      status: toDbPromoActiveStatus(dto.status ?? 'Activo'),
      productIds: dto.productIds,
      categoryIds: dto.categoryIds,
    });

    return this.mapDiscount(created);
  }

  async updateDiscount(id: number, dto: UpdateDiscountDto) {
    const existing = await this.repo.findDiscountById(id);
    if (!existing) throw new NotFoundException('Descuento no encontrado');

    const nextType = dto.type
      ? this.parseDiscountType(dto.type)
      : fromDbDiscountType(existing.discountType);
    const nextValue = dto.value ?? decimalToNumber(existing.discountValue);

    this.validateDiscountValue(nextType, nextValue);

    const updated = await this.repo.updateDiscount(id, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.type !== undefined ? { discountType: toDbDiscountType(nextType) } : {}),
      ...(dto.value !== undefined ? { discountValue: nextValue } : {}),
      ...(dto.status !== undefined ? { status: toDbPromoActiveStatus(dto.status) } : {}),
      ...(dto.productIds !== undefined ? { productIds: dto.productIds } : {}),
      ...(dto.categoryIds !== undefined ? { categoryIds: dto.categoryIds } : {}),
    });

    return this.mapDiscount(updated);
  }

  async deleteDiscount(id: number) {
    const existing = await this.repo.findDiscountById(id);
    if (!existing) return;
    await this.repo.deleteDiscount(id);
  }

  // ── Cupones ────────────────────────────────────────────────────────────

  private mapCupon(c: Cupon, now = new Date()) {
    const discountType = fromDbDiscountType(c.discountType);
    const manualStatus = fromDbCuponManualStatus(c.manualStatus);
    const discountValue = decimalToNumber(c.discountValue);
    const derived = hydrateCuponDerivedFields({
      discountType,
      discountValue,
      maxUses: c.maxUses,
      currentUses: c.currentUses,
      expiresDate: c.expiresDate,
      manualStatus,
      now,
    });

    return {
      id: c.id,
      code: c.code,
      discountType,
      discountValue,
      maxUses: c.maxUses,
      currentUses: c.currentUses,
      expiresDate: c.expiresDate ? c.expiresDate.toISOString().substring(0, 10) : null,
      ...derived,
    };
  }

  async listCupones(now = new Date()) {
    const list = await this.repo.listCupones();
    return list.map((c) => this.mapCupon(c, now));
  }

  async getCuponById(id: number, now = new Date()) {
    const cupon = await this.repo.findCuponById(id);
    if (!cupon) return null;
    return this.mapCupon(cupon, now);
  }

  async createCupon(dto: CreateCuponDto) {
    const expiresDate = dto.expiresDate ? new Date(dto.expiresDate) : null;

    const created = await this.repo.createCupon({
      code: dto.code.trim().toUpperCase(),
      discountType: toDbDiscountType(dto.discountType),
      discountValue: dto.discountValue,
      maxUses: dto.maxUses ?? 0,
      currentUses: 0,
      expiresDate,
      manualStatus: toDbCuponManualStatus(dto.manualStatus ?? 'Activo'),
    });

    return this.mapCupon(created);
  }

  async updateCupon(id: number, dto: UpdateCuponDto) {
    const existing = await this.repo.findCuponById(id);
    if (!existing) throw new NotFoundException('Cupón no encontrado');

    const updated = await this.repo.updateCupon(id, {
      ...(dto.code !== undefined ? { code: dto.code.trim().toUpperCase() } : {}),
      ...(dto.discountType !== undefined ? { discountType: toDbDiscountType(dto.discountType) } : {}),
      ...(dto.discountValue !== undefined ? { discountValue: dto.discountValue } : {}),
      ...(dto.maxUses !== undefined ? { maxUses: dto.maxUses } : {}),
      ...(dto.currentUses !== undefined ? { currentUses: dto.currentUses } : {}),
      ...(dto.expiresDate !== undefined
        ? { expiresDate: dto.expiresDate ? new Date(dto.expiresDate) : null }
        : {}),
      ...(dto.manualStatus !== undefined ? { manualStatus: toDbCuponManualStatus(dto.manualStatus) } : {}),
    });

    return this.mapCupon(updated);
  }

  async deleteCupon(id: number) {
    const existing = await this.repo.findCuponById(id);
    if (!existing) return;
    await this.repo.deleteCupon(id);
  }

  async redeemCupon(dto: RedeemCuponDto) {
    const code = dto.code.trim().toUpperCase();
    const found = await this.repo.findCuponByCode(code);
    if (!found) throw new NotFoundException('Cupón no encontrado');

    const discountType = fromDbDiscountType(found.discountType);
    const manualStatus = fromDbCuponManualStatus(found.manualStatus);
    const discountValue = decimalToNumber(found.discountValue);
    const derived = hydrateCuponDerivedFields({
      discountType,
      discountValue,
      maxUses: found.maxUses,
      currentUses: found.currentUses,
      expiresDate: found.expiresDate,
      manualStatus,
    });

    if (derived.status !== 'Activo') {
      throw new BadRequestException(`Cupón no válido: ${derived.status}`);
    }

    await this.repo.updateCupon(found.id, { currentUses: found.currentUses + 1 });

    return {
      applied: {
        id: found.id,
        code: found.code,
        discountType,
        discountValue,
      },
    };
  }

  // ── Certificados ──────────────────────────────────────────────────────

  async listCertificados() {
    const list = await this.repo.listCertificados();
    return list.map((c) => this.mapCertificadoResponse(c));
  }

  async getCertificadoBySerial(serialRaw: string) {
    const serial = serialRaw.trim().toUpperCase();
    if (!serial) throw new BadRequestException('Serial inválido');

    const found = await this.repo.findCertificadoBySerial(serial);
    if (!found) throw new NotFoundException('No se encontró ningún certificado con este número.');

    return this.mapCertificadoResponse(found);
  }

  async createCertificado(dto: CreateCertificadoDto) {
    const serial = dto.serial ? dto.serial.trim().toUpperCase() : generateCertificadoSerial('VC');

    const created = await this.repo.createCertificado({
      serial,
      origin: dto.origin,
      items: dto.items,
      description: dto.description ?? null,
      issueDate: new Date(),
      status: CertificadoStatus.DISPONIBLE,
      amount: dto.amount ?? null,
    });

    return this.mapCertificadoResponse(created);
  }

  async markCertificadoDelivered(id: number) {
    const existing = await this.repo.findCertificadoById(id);
    if (!existing) throw new NotFoundException('Certificado no encontrado');
    if (existing.status !== CertificadoStatus.DISPONIBLE) {
      throw new BadRequestException(`Este certificado no puede usarse (Estado: ${fromDbCertificadoStatus(existing.status)}).`);
    }

    const updated = await this.repo.updateCertificado(id, { 
      status: CertificadoStatus.ENTREGADO,
      redeemedAt: new Date()
    });
    return this.mapCertificadoResponse(updated);
  }

  async cancelCertificado(id: number) {
    const existing = await this.repo.findCertificadoById(id);
    if (!existing) throw new NotFoundException('Certificado no encontrado');
    if (existing.status !== CertificadoStatus.DISPONIBLE) {
      throw new BadRequestException('Solo se pueden anular certificados disponibles');
    }

    const updated = await this.repo.updateCertificado(id, { status: CertificadoStatus.ANULADO });
    return this.mapCertificadoResponse(updated);
  }

  async deleteCertificado(id: number) {
    const existing = await this.repo.findCertificadoById(id);
    if (!existing) return;
    await this.repo.deleteCertificado(id);
  }

  async redeemCertificado(dto: RedeemCertificadoDto) {
    const serial = dto.serial.trim().toUpperCase();
    const found = await this.repo.findCertificadoBySerial(serial);
    if (!found) throw new NotFoundException('No se encontró ningún certificado con este número.');

    if (found.status !== CertificadoStatus.DISPONIBLE) {
      throw new BadRequestException(`Este certificado no puede usarse (Estado: ${fromDbCertificadoStatus(found.status)}).`);
    }

    const updated = await this.repo.updateCertificado(found.id, { 
      status: CertificadoStatus.ENTREGADO,
      redeemedAt: new Date(),
      redeemedOrderId: dto.redeemedOrderId ?? null,
    });

    return this.mapCertificadoResponse(updated);
  }
}
