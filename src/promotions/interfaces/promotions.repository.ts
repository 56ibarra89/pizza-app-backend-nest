import type {
  Certificado,
  Cupon,
  DiscountPromotion,
  HappyHourPromotion,
  HappyHourProduct,
  HappyHourCategory,
  DiscountProduct,
  DiscountCategory,
  CertificadoItem,
} from '@prisma/client';

export const PROMOTIONS_REPOSITORY = Symbol('PROMOTIONS_REPOSITORY');

export type HappyHourWithRelations = HappyHourPromotion & {
  products: HappyHourProduct[];
  categories: HappyHourCategory[];
};

export type DiscountWithRelations = DiscountPromotion & {
  products: DiscountProduct[];
  categories: DiscountCategory[];
};

export type CertificadoWithRelations = Certificado & {
  items: CertificadoItem[];
};

export interface IPromotionsRepository {
  // Happy Hours
  listHappyHours(): Promise<HappyHourWithRelations[]>;
  findHappyHourById(id: number): Promise<HappyHourWithRelations | null>;
  createHappyHour(data: {
    name: string;
    daysOfWeek: import('@prisma/client').WeekDay[];
    startMinutes: number;
    endMinutes: number;
    promotionType: import('@prisma/client').HappyHourPromotionType;
    promotionValue: number | null;
    status: import('@prisma/client').PromoActiveStatus;
    appliesTo: string | null;
    productIds?: string[];
    categoryIds?: string[];
  }): Promise<HappyHourWithRelations>;
  updateHappyHour(
    id: number,
    data: {
      name?: string;
      daysOfWeek?: import('@prisma/client').WeekDay[];
      startMinutes?: number;
      endMinutes?: number;
      promotionType?: import('@prisma/client').HappyHourPromotionType;
      promotionValue?: number | null;
      status?: import('@prisma/client').PromoActiveStatus;
      appliesTo?: string | null;
      productIds?: string[];
      categoryIds?: string[];
    },
  ): Promise<HappyHourWithRelations>;
  deleteHappyHour(id: number): Promise<void>;

  // Discounts
  listDiscounts(): Promise<DiscountWithRelations[]>;
  findDiscountById(id: number): Promise<DiscountWithRelations | null>;
  createDiscount(data: {
    name: string;
    discountType: import('@prisma/client').CuponDiscountType;
    discountValue: number;
    status: import('@prisma/client').PromoActiveStatus;
    productIds?: string[];
    categoryIds?: string[];
  }): Promise<DiscountWithRelations>;
  updateDiscount(
    id: number,
    data: {
      name?: string;
      discountType?: import('@prisma/client').CuponDiscountType;
      discountValue?: number;
      status?: import('@prisma/client').PromoActiveStatus;
      productIds?: string[];
      categoryIds?: string[];
    },
  ): Promise<DiscountWithRelations>;
  deleteDiscount(id: number): Promise<void>;

  // Cupones
  listCupones(): Promise<Cupon[]>;
  findCuponById(id: number): Promise<Cupon | null>;
  findCuponByCode(code: string): Promise<Cupon | null>;
  createCupon(data: {
    code: string;
    discountType: import('@prisma/client').CuponDiscountType;
    discountValue: number;
    maxUses: number;
    currentUses: number;
    expiresDate: Date | null;
    manualStatus: import('@prisma/client').CuponManualStatus;
  }): Promise<Cupon>;
  updateCupon(
    id: number,
    data: {
      code?: string;
      discountType?: import('@prisma/client').CuponDiscountType;
      discountValue?: number;
      maxUses?: number;
      currentUses?: number;
      expiresDate?: Date | null;
      manualStatus?: import('@prisma/client').CuponManualStatus;
    },
  ): Promise<Cupon>;
  deleteCupon(id: number): Promise<void>;

  // Certificados
  listCertificados(): Promise<CertificadoWithRelations[]>;
  findCertificadoById(id: number): Promise<CertificadoWithRelations | null>;
  findCertificadoBySerial(serial: string): Promise<CertificadoWithRelations | null>;
  createCertificado(data: {
    serial: string;
    origin: string;
    items: { productId: string; quantity: number }[];
    issueDate: Date;
    description: string | null;
    status: import('@prisma/client').CertificadoStatus;
    amount?: number | null;
  }): Promise<CertificadoWithRelations>;
  updateCertificado(
    id: number,
    data: {
      status?: import('@prisma/client').CertificadoStatus;
      description?: string | null;
      redeemedAt?: Date | null;
      redeemedOrderId?: string | null;
    },
  ): Promise<CertificadoWithRelations>;
  deleteCertificado(id: number): Promise<void>;
}
