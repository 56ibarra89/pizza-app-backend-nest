import type { Certificado, Cupon, DiscountPromotion, HappyHourPromotion } from '@prisma/client';

export const PROMOTIONS_REPOSITORY = Symbol('PROMOTIONS_REPOSITORY');

export interface IPromotionsRepository {
  // Happy Hours
  listHappyHours(): Promise<HappyHourPromotion[]>;
  findHappyHourById(id: number): Promise<HappyHourPromotion | null>;
  createHappyHour(data: Omit<HappyHourPromotion, 'id' | 'createdAt' | 'updatedAt'>): Promise<HappyHourPromotion>;
  updateHappyHour(
    id: number,
    data: Partial<Omit<HappyHourPromotion, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<HappyHourPromotion>;
  deleteHappyHour(id: number): Promise<void>;

  // Discounts
  listDiscounts(): Promise<DiscountPromotion[]>;
  findDiscountById(id: number): Promise<DiscountPromotion | null>;
  createDiscount(data: Omit<DiscountPromotion, 'id' | 'createdAt' | 'updatedAt'>): Promise<DiscountPromotion>;
  updateDiscount(
    id: number,
    data: Partial<Omit<DiscountPromotion, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<DiscountPromotion>;
  deleteDiscount(id: number): Promise<void>;

  // Cupones
  listCupones(): Promise<Cupon[]>;
  findCuponById(id: number): Promise<Cupon | null>;
  findCuponByCode(code: string): Promise<Cupon | null>;
  createCupon(data: Omit<Cupon, 'id' | 'createdAt' | 'updatedAt'>): Promise<Cupon>;
  updateCupon(
    id: number,
    data: Partial<Omit<Cupon, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<Cupon>;
  deleteCupon(id: number): Promise<void>;

  // Certificados
  listCertificados(): Promise<Certificado[]>;
  findCertificadoById(id: number): Promise<Certificado | null>;
  findCertificadoBySerial(serial: string): Promise<Certificado | null>;
  createCertificado(
    data: Omit<Certificado, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<Certificado>;
  updateCertificado(
    id: number,
    data: Partial<Omit<Certificado, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<Certificado>;
  deleteCertificado(id: number): Promise<void>;
}
