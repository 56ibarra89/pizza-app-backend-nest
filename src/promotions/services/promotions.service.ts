import { Injectable } from '@nestjs/common';
import type { CreateCertificadoDto } from '../dto/certificados/create-certificado.dto';
import type { RedeemCertificadoDto } from '../dto/certificados/redeem-certificado.dto';
import type { CreateCuponDto } from '../dto/cupones/create-cupon.dto';
import type { RedeemCuponDto } from '../dto/cupones/redeem-cupon.dto';
import type { UpdateCuponDto } from '../dto/cupones/update-cupon.dto';
import type { CreateDiscountDto } from '../dto/discounts/create-discount.dto';
import type { UpdateDiscountDto } from '../dto/discounts/update-discount.dto';
import type { CreateHappyHourDto } from '../dto/happy-hours/create-happy-hour.dto';
import type { UpdateHappyHourDto } from '../dto/happy-hours/update-happy-hour.dto';
import { CertificatePromotionsService } from './certificate-promotions.service';
import { CommercialPromotionsService } from './commercial-promotions.service';
import { CouponPromotionsService } from './coupon-promotions.service';

@Injectable()
export class PromotionsService {
  constructor(
    private readonly commercialPromotions: CommercialPromotionsService,
    private readonly coupons: CouponPromotionsService,
    private readonly certificates: CertificatePromotionsService,
  ) {}

  listHappyHours() {
    return this.commercialPromotions.listHappyHours();
  }

  createHappyHour(dto: CreateHappyHourDto) {
    return this.commercialPromotions.createHappyHour(dto);
  }

  updateHappyHour(id: number, dto: UpdateHappyHourDto) {
    return this.commercialPromotions.updateHappyHour(id, dto);
  }

  deleteHappyHour(id: number) {
    return this.commercialPromotions.deleteHappyHour(id);
  }

  listDiscounts() {
    return this.commercialPromotions.listDiscounts();
  }

  createDiscount(dto: CreateDiscountDto) {
    return this.commercialPromotions.createDiscount(dto);
  }

  updateDiscount(id: number, dto: UpdateDiscountDto) {
    return this.commercialPromotions.updateDiscount(id, dto);
  }

  deleteDiscount(id: number) {
    return this.commercialPromotions.deleteDiscount(id);
  }

  listCupones(now = new Date()) {
    return this.coupons.list(now);
  }

  getCuponById(id: number, now = new Date()) {
    return this.coupons.findById(id, now);
  }

  getCuponByCode(code: string, now = new Date()) {
    return this.coupons.findByCode(code, now);
  }

  createCupon(dto: CreateCuponDto) {
    return this.coupons.create(dto);
  }

  updateCupon(id: number, dto: UpdateCuponDto) {
    return this.coupons.update(id, dto);
  }

  deleteCupon(id: number) {
    return this.coupons.delete(id);
  }

  redeemCupon(dto: RedeemCuponDto) {
    return this.coupons.redeem(dto);
  }

  listCertificados() {
    return this.certificates.list();
  }

  getCertificadoBySerial(serial: string) {
    return this.certificates.findBySerial(serial);
  }

  createCertificado(dto: CreateCertificadoDto) {
    return this.certificates.create(dto);
  }

  markCertificadoDelivered(id: number) {
    return this.certificates.markDelivered(id);
  }

  cancelCertificado(id: number) {
    return this.certificates.cancel(id);
  }

  deleteCertificado(id: number) {
    return this.certificates.delete(id);
  }

  redeemCertificado(dto: RedeemCertificadoDto) {
    return this.certificates.redeem(dto);
  }
}
