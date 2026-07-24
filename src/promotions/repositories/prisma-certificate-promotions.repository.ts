import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  CertificateWithRelations,
  CreateCertificatePromotionData,
  ICertificatePromotionsRepository,
  UpdateCertificatePromotionData,
} from '../interfaces/certificate-promotions.repository';

@Injectable()
export class PrismaCertificatePromotionsRepository implements ICertificatePromotionsRepository {
  private readonly includeRelations = { items: true } as const;

  constructor(private readonly prisma: PrismaService) {}

  list(): Promise<CertificateWithRelations[]> {
    return this.prisma.certificado.findMany({
      where: { deletedAt: null },
      orderBy: { id: 'desc' },
      include: this.includeRelations,
    });
  }

  findById(id: number): Promise<CertificateWithRelations | null> {
    return this.prisma.certificado.findFirst({
      where: { id, deletedAt: null },
      include: this.includeRelations,
    });
  }

  findBySerial(serial: string): Promise<CertificateWithRelations | null> {
    return this.prisma.certificado.findFirst({
      where: { serial, deletedAt: null },
      include: this.includeRelations,
    });
  }

  create(
    data: CreateCertificatePromotionData,
  ): Promise<CertificateWithRelations> {
    const { items, ...fields } = data;

    return this.prisma.certificado.create({
      data: {
        ...fields,
        items: { create: items },
      },
      include: this.includeRelations,
    });
  }

  update(
    id: number,
    data: UpdateCertificatePromotionData,
  ): Promise<CertificateWithRelations> {
    return this.prisma.certificado.update({
      where: { id },
      data,
      include: this.includeRelations,
    });
  }

  async delete(id: number): Promise<void> {
    await this.prisma.certificado.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
