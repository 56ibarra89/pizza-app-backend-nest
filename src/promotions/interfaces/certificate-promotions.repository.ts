import type {
  Certificado,
  CertificadoItem,
  CertificadoStatus,
} from '@prisma/client';

export const CERTIFICATE_PROMOTIONS_REPOSITORY = Symbol(
  'CERTIFICATE_PROMOTIONS_REPOSITORY',
);

export type CertificateWithRelations = Certificado & {
  items: CertificadoItem[];
};

export interface CreateCertificatePromotionData {
  serial: string;
  origin: string;
  items: { productId: string; quantity: number }[];
  issueDate: Date;
  description: string | null;
  status: CertificadoStatus;
  amount?: number | null;
}

export interface UpdateCertificatePromotionData {
  status?: CertificadoStatus;
  description?: string | null;
  redeemedAt?: Date | null;
  redeemedOrderId?: string | null;
}

export interface ICertificatePromotionsRepository {
  list(): Promise<CertificateWithRelations[]>;
  findById(id: number): Promise<CertificateWithRelations | null>;
  findBySerial(serial: string): Promise<CertificateWithRelations | null>;
  create(
    data: CreateCertificatePromotionData,
  ): Promise<CertificateWithRelations>;
  update(
    id: number,
    data: UpdateCertificatePromotionData,
  ): Promise<CertificateWithRelations>;
  delete(id: number): Promise<void>;
}
