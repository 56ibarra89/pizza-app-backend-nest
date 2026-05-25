import { Injectable } from '@nestjs/common';
import type { Certificado, Cupon } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  IPromotionsRepository,
  HappyHourWithRelations,
  DiscountWithRelations,
  CertificadoWithRelations,
} from '../interfaces/promotions.repository';

@Injectable()
export class PrismaPromotionsRepository implements IPromotionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private happyHourInclude = { products: true, categories: true } as const;
  private discountInclude = { products: true, categories: true } as const;

  // ── Happy Hours ────────────────────────────────────────────────────────────

  listHappyHours(): Promise<HappyHourWithRelations[]> {
    return this.prisma.happyHourPromotion.findMany({
      where: { deletedAt: null },
      orderBy: { id: 'asc' },
      include: this.happyHourInclude,
    });
  }

  findHappyHourById(id: number): Promise<HappyHourWithRelations | null> {
    return this.prisma.happyHourPromotion.findFirst({
      where: { id, deletedAt: null },
      include: this.happyHourInclude,
    });
  }

  createHappyHour(data: Parameters<IPromotionsRepository['createHappyHour']>[0]): Promise<HappyHourWithRelations> {
    const { productIds, categoryIds, ...scalar } = data;
    return this.prisma.happyHourPromotion.create({
      data: {
        ...scalar,
        ...(productIds?.length
          ? { products: { create: productIds.map((productId) => ({ productId })) } }
          : {}),
        ...(categoryIds?.length
          ? { categories: { create: categoryIds.map((categoryId) => ({ categoryId })) } }
          : {}),
      },
      include: this.happyHourInclude,
    });
  }

  async updateHappyHour(
    id: number,
    data: Parameters<IPromotionsRepository['updateHappyHour']>[1],
  ): Promise<HappyHourWithRelations> {
    const { productIds, categoryIds, ...scalar } = data;

    return this.prisma.happyHourPromotion.update({
      where: { id },
      data: {
        ...scalar,
        ...(productIds !== undefined
          ? {
              products: {
                deleteMany: {},
                create: productIds.map((productId) => ({ productId })),
              },
            }
          : {}),
        ...(categoryIds !== undefined
          ? {
              categories: {
                deleteMany: {},
                create: categoryIds.map((categoryId) => ({ categoryId })),
              },
            }
          : {}),
      },
      include: this.happyHourInclude,
    });
  }

  async deleteHappyHour(id: number): Promise<void> {
    await this.prisma.happyHourPromotion.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  // ── Discounts ──────────────────────────────────────────────────────────────

  listDiscounts(): Promise<DiscountWithRelations[]> {
    return this.prisma.discountPromotion.findMany({
      where: { deletedAt: null },
      orderBy: { id: 'asc' },
      include: this.discountInclude,
    });
  }

  findDiscountById(id: number): Promise<DiscountWithRelations | null> {
    return this.prisma.discountPromotion.findFirst({
      where: { id, deletedAt: null },
      include: this.discountInclude,
    });
  }

  createDiscount(data: Parameters<IPromotionsRepository['createDiscount']>[0]): Promise<DiscountWithRelations> {
    const { productIds, categoryIds, ...scalar } = data;
    return this.prisma.discountPromotion.create({
      data: {
        ...scalar,
        ...(productIds?.length
          ? { products: { create: productIds.map((productId) => ({ productId })) } }
          : {}),
        ...(categoryIds?.length
          ? { categories: { create: categoryIds.map((categoryId) => ({ categoryId })) } }
          : {}),
      },
      include: this.discountInclude,
    });
  }

  async updateDiscount(
    id: number,
    data: Parameters<IPromotionsRepository['updateDiscount']>[1],
  ): Promise<DiscountWithRelations> {
    const { productIds, categoryIds, ...scalar } = data;

    return this.prisma.discountPromotion.update({
      where: { id },
      data: {
        ...scalar,
        ...(productIds !== undefined
          ? {
              products: {
                deleteMany: {},
                create: productIds.map((productId) => ({ productId })),
              },
            }
          : {}),
        ...(categoryIds !== undefined
          ? {
              categories: {
                deleteMany: {},
                create: categoryIds.map((categoryId) => ({ categoryId })),
              },
            }
          : {}),
      },
      include: this.discountInclude,
    });
  }

  async deleteDiscount(id: number): Promise<void> {
    await this.prisma.discountPromotion.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  // ── Cupones ────────────────────────────────────────────────────────────────

  listCupones(): Promise<Cupon[]> {
    return this.prisma.cupon.findMany({ where: { deletedAt: null }, orderBy: { id: 'asc' } });
  }

  findCuponById(id: number): Promise<Cupon | null> {
    return this.prisma.cupon.findFirst({ where: { id, deletedAt: null } });
  }

  findCuponByCode(code: string): Promise<Cupon | null> {
    return this.prisma.cupon.findFirst({ where: { code, deletedAt: null } });
  }

  createCupon(data: Parameters<IPromotionsRepository['createCupon']>[0]): Promise<Cupon> {
    return this.prisma.cupon.create({ data });
  }

  updateCupon(
    id: number,
    data: Parameters<IPromotionsRepository['updateCupon']>[1],
  ): Promise<Cupon> {
    return this.prisma.cupon.update({ where: { id }, data });
  }

  async deleteCupon(id: number): Promise<void> {
    await this.prisma.cupon.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  // ── Certificados ───────────────────────────────────────────────────────────

  private certificadoInclude = { items: true } as const;

  listCertificados(): Promise<CertificadoWithRelations[]> {
    return this.prisma.certificado.findMany({ where: { deletedAt: null }, orderBy: { id: 'desc' }, include: this.certificadoInclude });
  }

  findCertificadoById(id: number): Promise<CertificadoWithRelations | null> {
    return this.prisma.certificado.findFirst({ where: { id, deletedAt: null }, include: this.certificadoInclude });
  }

  findCertificadoBySerial(serial: string): Promise<CertificadoWithRelations | null> {
    return this.prisma.certificado.findFirst({ where: { serial, deletedAt: null }, include: this.certificadoInclude });
  }

  createCertificado(data: Parameters<IPromotionsRepository['createCertificado']>[0]): Promise<CertificadoWithRelations> {
    const { items, ...scalar } = data;
    return this.prisma.certificado.create({ 
      data: {
        ...scalar,
        items: {
          create: items,
        }
      },
      include: this.certificadoInclude,
    });
  }

  updateCertificado(
    id: number,
    data: Parameters<IPromotionsRepository['updateCertificado']>[1],
  ): Promise<CertificadoWithRelations> {
    return this.prisma.certificado.update({ where: { id }, data, include: this.certificadoInclude });
  }

  async deleteCertificado(id: number): Promise<void> {
    await this.prisma.certificado.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
