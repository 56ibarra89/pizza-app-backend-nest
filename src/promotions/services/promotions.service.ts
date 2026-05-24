import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  type Certificado,
  CertificadoStatus,
  CuponDiscountType,
} from '@prisma/client';
import {
  PROMOTIONS_REPOSITORY,
  type IPromotionsRepository,
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

  private mapCertificadoResponse(c: Certificado) {
    return {
      id: c.id,
      serial: c.serial,
      origin: c.origin,
      product: c.product,
      issueDate: c.issueDate,
      notes: c.notes ?? undefined,
      status: fromDbCertificadoStatus(c.status),
    };
  }

  // ── Happy Hours ───────────────────────────────────────────────────────────

  async listHappyHours() {
    const list = await this.repo.listHappyHours();
    return list.map((h) => {
      const promotionType = fromDbHappyHourPromotionType(h.promotionType);
      const derived = buildHappyHourDerivedFields({
        daysOfWeek: h.daysOfWeek,
        startTime: h.startTime,
        endTime: h.endTime,
        promotionType,
        promotionValue: h.promotionValue,
        appliesTo: h.appliesTo,
      });

      return {
        id: h.id,
        name: h.name,
        daysOfWeek: h.daysOfWeek,
        startTime: h.startTime,
        endTime: h.endTime,
        promotionType,
        promotionValue: h.promotionValue,
        status: fromDbPromoActiveStatus(h.status),
        appliesTo: h.appliesTo ?? undefined,
        ...derived,
      };
    });
  }

  async createHappyHour(dto: CreateHappyHourDto) {
    const created = await this.repo.createHappyHour({
      name: dto.name,
      daysOfWeek: dto.daysOfWeek,
      startTime: dto.startTime,
      endTime: dto.endTime,
      promotionType: toDbHappyHourPromotionType(dto.promotionType),
      promotionValue: dto.promotionType === '2x1' ? '' : dto.promotionValue,
      status: toDbPromoActiveStatus(dto.status ?? 'Activo'),
      appliesTo: dto.promotionType === '2x1' ? dto.appliesTo : null,
    });

    const promotionType = fromDbHappyHourPromotionType(created.promotionType);
    const derived = buildHappyHourDerivedFields({
      daysOfWeek: created.daysOfWeek,
      startTime: created.startTime,
      endTime: created.endTime,
      promotionType,
      promotionValue: created.promotionValue,
      appliesTo: created.appliesTo,
    });
    return {
      id: created.id,
      name: created.name,
      daysOfWeek: created.daysOfWeek,
      startTime: created.startTime,
      endTime: created.endTime,
      promotionType,
      promotionValue: created.promotionValue,
      status: fromDbPromoActiveStatus(created.status),
      appliesTo: created.appliesTo ?? undefined,
      ...derived,
    };
  }

  async updateHappyHour(id: number, dto: UpdateHappyHourDto) {
    const existing = await this.repo.findHappyHourById(id);
    if (!existing) throw new NotFoundException('Regla Happy Hour no encontrada');

    const nextPromotionType = dto.promotionType ?? fromDbHappyHourPromotionType(existing.promotionType);

    const updated = await this.repo.updateHappyHour(id, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.daysOfWeek !== undefined ? { daysOfWeek: dto.daysOfWeek } : {}),
      ...(dto.startTime !== undefined ? { startTime: dto.startTime } : {}),
      ...(dto.endTime !== undefined ? { endTime: dto.endTime } : {}),
      ...(dto.promotionType !== undefined ? { promotionType: toDbHappyHourPromotionType(dto.promotionType) } : {}),
      ...(dto.status !== undefined ? { status: toDbPromoActiveStatus(dto.status) } : {}),
      ...(dto.promotionValue !== undefined
        ? { promotionValue: nextPromotionType === '2x1' ? '' : dto.promotionValue }
        : {}),
      ...(dto.appliesTo !== undefined
        ? { appliesTo: nextPromotionType === '2x1' ? dto.appliesTo : null }
        : {}),
    });

    const promotionType = fromDbHappyHourPromotionType(updated.promotionType);
    const derived = buildHappyHourDerivedFields({
      daysOfWeek: updated.daysOfWeek,
      startTime: updated.startTime,
      endTime: updated.endTime,
      promotionType,
      promotionValue: updated.promotionValue,
      appliesTo: updated.appliesTo,
    });

    return {
      id: updated.id,
      name: updated.name,
      daysOfWeek: updated.daysOfWeek,
      startTime: updated.startTime,
      endTime: updated.endTime,
      promotionType,
      promotionValue: updated.promotionValue,
      status: fromDbPromoActiveStatus(updated.status),
      appliesTo: updated.appliesTo ?? undefined,
      ...derived,
    };
  }

  async deleteHappyHour(id: number) {
    const existing = await this.repo.findHappyHourById(id);
    if (!existing) return;
    await this.repo.deleteHappyHour(id);
  }

  // ── Discounts ─────────────────────────────────────────────────────────────

  async listDiscounts() {
    const list = await this.repo.listDiscounts();
    return list.map((d) => ({
      id: d.id,
      name: d.name,
      type: d.discountType === CuponDiscountType.PORCENTAJE ? 'Porcentaje' : 'Monto Fijo',
      value:
        d.discountType === CuponDiscountType.PORCENTAJE
          ? `${d.discountValue}%`
          : `C$${d.discountValue}`,
      status: fromDbPromoActiveStatus(d.status),
      appliesTo: d.appliesTo,
    }));
  }

  private parseDiscountType(type: string): 'porcentaje' | 'monto_fijo' {
    return type.trim().toLowerCase() === 'porcentaje' ? 'porcentaje' : 'monto_fijo';
  }

  private parseNumericString(value: string): string {
    return value.replace(/[^0-9.]/g, '');
  }

  private validateDiscountValue(discountType: 'porcentaje' | 'monto_fijo', numeric: string) {
    const n = Number.parseFloat(numeric);
    if (!numeric || Number.isNaN(n) || n <= 0) {
      throw new BadRequestException('Valor de descuento inválido');
    }
    if (discountType === 'porcentaje' && n > 100) {
      throw new BadRequestException('El porcentaje no puede superar 100');
    }
  }

  async createDiscount(dto: CreateDiscountDto) {
    const discountType = this.parseDiscountType(dto.type);
    const discountValue = this.parseNumericString(dto.value);
    this.validateDiscountValue(discountType, discountValue);

    const created = await this.repo.createDiscount({
      name: dto.name,
      discountType: toDbDiscountType(discountType),
      discountValue,
      status: toDbPromoActiveStatus(dto.status ?? 'Activo'),
      appliesTo: dto.appliesTo,
    });

    return {
      id: created.id,
      name: created.name,
      type: created.discountType === CuponDiscountType.PORCENTAJE ? 'Porcentaje' : 'Monto Fijo',
      value:
        created.discountType === CuponDiscountType.PORCENTAJE
          ? `${created.discountValue}%`
          : `C$${created.discountValue}`,
      status: fromDbPromoActiveStatus(created.status),
      appliesTo: created.appliesTo,
    };
  }

  async updateDiscount(id: number, dto: UpdateDiscountDto) {
    const existing = await this.repo.findDiscountById(id);
    if (!existing) throw new NotFoundException('Descuento no encontrado');

    const nextType = dto.type ? this.parseDiscountType(dto.type) : fromDbDiscountType(existing.discountType);
    const nextValue = dto.value ? this.parseNumericString(dto.value) : existing.discountValue;

    this.validateDiscountValue(nextType, nextValue);

    const updated = await this.repo.updateDiscount(id, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.type !== undefined ? { discountType: toDbDiscountType(nextType) } : {}),
      ...(dto.value !== undefined ? { discountValue: nextValue } : {}),
      ...(dto.status !== undefined ? { status: toDbPromoActiveStatus(dto.status) } : {}),
      ...(dto.appliesTo !== undefined ? { appliesTo: dto.appliesTo } : {}),
    });

    return {
      id: updated.id,
      name: updated.name,
      type: updated.discountType === CuponDiscountType.PORCENTAJE ? 'Porcentaje' : 'Monto Fijo',
      value:
        updated.discountType === CuponDiscountType.PORCENTAJE
          ? `${updated.discountValue}%`
          : `C$${updated.discountValue}`,
      status: fromDbPromoActiveStatus(updated.status),
      appliesTo: updated.appliesTo,
    };
  }

  async deleteDiscount(id: number) {
    const existing = await this.repo.findDiscountById(id);
    if (!existing) return;
    await this.repo.deleteDiscount(id);
  }

  // ── Cupones ───────────────────────────────────────────────────────────────

  async listCupones(now = new Date()) {
    const list = await this.repo.listCupones();
    return list.map((c) => {
      const discountType = fromDbDiscountType(c.discountType);
      const manualStatus = fromDbCuponManualStatus(c.manualStatus);
      const derived = hydrateCuponDerivedFields({
        discountType,
        discountValue: c.discountValue,
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
        discountValue: c.discountValue,
        maxUses: c.maxUses,
        currentUses: c.currentUses,
        expiresDate: c.expiresDate,
        ...derived,
      };
    });
  }

  async createCupon(dto: CreateCuponDto) {
    const created = await this.repo.createCupon({
      code: dto.code.trim().toUpperCase(),
      discountType: toDbDiscountType(dto.discountType),
      discountValue: dto.discountValue,
      maxUses: dto.maxUses,
      currentUses: 0,
      expiresDate: dto.expiresDate ?? '',
      manualStatus: toDbCuponManualStatus(dto.manualStatus ?? 'Activo'),
    });

    const list = await this.listCupones();
    return list.find((c) => c.id === created.id) ?? list[0];
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
      ...(dto.expiresDate !== undefined ? { expiresDate: dto.expiresDate } : {}),
      ...(dto.manualStatus !== undefined ? { manualStatus: toDbCuponManualStatus(dto.manualStatus) } : {}),
    });

    const list = await this.listCupones();
    return list.find((c) => c.id === updated.id) ?? list[0];
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
    const derived = hydrateCuponDerivedFields({
      discountType,
      discountValue: found.discountValue,
      maxUses: found.maxUses,
      currentUses: found.currentUses,
      expiresDate: found.expiresDate,
      manualStatus,
    });

    if (derived.status !== 'Activo') {
      throw new BadRequestException(`Cupón no válido: ${derived.status}`);
    }

    const updated = await this.repo.updateCupon(found.id, { currentUses: found.currentUses + 1 });

    return {
      applied: {
        code: updated.code,
        discountType,
        discountValue: Number.parseFloat(updated.discountValue),
      },
    };
  }

  // ── Certificados ──────────────────────────────────────────────────────────

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
      product: dto.product,
      notes: dto.notes ?? null,
      issueDate: this.issueDateToday(),
      status: CertificadoStatus.DISPONIBLE,
    });

    return this.mapCertificadoResponse(created);
  }

  private issueDateToday() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  async markCertificadoDelivered(id: number) {
    const existing = await this.repo.findCertificadoById(id);
    if (!existing) throw new NotFoundException('Certificado no encontrado');
    if (existing.status !== CertificadoStatus.DISPONIBLE) {
      throw new BadRequestException(`Este certificado no puede usarse (Estado: ${fromDbCertificadoStatus(existing.status)}).`);
    }

    const updated = await this.repo.updateCertificado(id, { status: CertificadoStatus.ENTREGADO });
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

    const updated = await this.repo.updateCertificado(found.id, { status: CertificadoStatus.ENTREGADO });

    return this.mapCertificadoResponse(updated);
  }
}
