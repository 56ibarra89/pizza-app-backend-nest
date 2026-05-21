import { Injectable } from '@nestjs/common';
import type { Certificado, Cupon, DiscountPromotion, HappyHourPromotion } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { IPromotionsRepository } from '../interfaces/promotions.repository';

@Injectable()
export class PrismaPromotionsRepository implements IPromotionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Happy Hours
  listHappyHours(): Promise<HappyHourPromotion[]> {
    return this.prisma.happyHourPromotion.findMany({ orderBy: { id: 'asc' } });
  }

  findHappyHourById(id: number): Promise<HappyHourPromotion | null> {
    return this.prisma.happyHourPromotion.findUnique({ where: { id } });
  }

  createHappyHour(
    data: Omit<HappyHourPromotion, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<HappyHourPromotion> {
    return this.prisma.happyHourPromotion.create({ data });
  }

  updateHappyHour(
    id: number,
    data: Partial<Omit<HappyHourPromotion, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<HappyHourPromotion> {
    return this.prisma.happyHourPromotion.update({ where: { id }, data });
  }

  async deleteHappyHour(id: number): Promise<void> {
    await this.prisma.happyHourPromotion.delete({ where: { id } });
  }

  // Discounts
  listDiscounts(): Promise<DiscountPromotion[]> {
    return this.prisma.discountPromotion.findMany({ orderBy: { id: 'asc' } });
  }

  findDiscountById(id: number): Promise<DiscountPromotion | null> {
    return this.prisma.discountPromotion.findUnique({ where: { id } });
  }

  createDiscount(
    data: Omit<DiscountPromotion, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<DiscountPromotion> {
    return this.prisma.discountPromotion.create({ data });
  }

  updateDiscount(
    id: number,
    data: Partial<Omit<DiscountPromotion, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<DiscountPromotion> {
    return this.prisma.discountPromotion.update({ where: { id }, data });
  }

  async deleteDiscount(id: number): Promise<void> {
    await this.prisma.discountPromotion.delete({ where: { id } });
  }

  // Cupones
  listCupones(): Promise<Cupon[]> {
    return this.prisma.cupon.findMany({ orderBy: { id: 'asc' } });
  }

  findCuponById(id: number): Promise<Cupon | null> {
    return this.prisma.cupon.findUnique({ where: { id } });
  }

  findCuponByCode(code: string): Promise<Cupon | null> {
    return this.prisma.cupon.findUnique({ where: { code } });
  }

  createCupon(data: Omit<Cupon, 'id' | 'createdAt' | 'updatedAt'>): Promise<Cupon> {
    return this.prisma.cupon.create({ data });
  }

  updateCupon(
    id: number,
    data: Partial<Omit<Cupon, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<Cupon> {
    return this.prisma.cupon.update({ where: { id }, data });
  }

  async deleteCupon(id: number): Promise<void> {
    await this.prisma.cupon.delete({ where: { id } });
  }

  // Certificados
  listCertificados(): Promise<Certificado[]> {
    return this.prisma.certificado.findMany({ orderBy: { id: 'desc' } });
  }

  findCertificadoById(id: number): Promise<Certificado | null> {
    return this.prisma.certificado.findUnique({ where: { id } });
  }

  findCertificadoBySerial(serial: string): Promise<Certificado | null> {
    return this.prisma.certificado.findUnique({ where: { serial } });
  }

  createCertificado(
    data: Omit<Certificado, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<Certificado> {
    return this.prisma.certificado.create({ data });
  }

  updateCertificado(
    id: number,
    data: Partial<Omit<Certificado, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<Certificado> {
    return this.prisma.certificado.update({ where: { id }, data });
  }

  async deleteCertificado(id: number): Promise<void> {
    await this.prisma.certificado.delete({ where: { id } });
  }
}
