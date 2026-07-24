import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CertificadoStatus } from '@prisma/client';
import type { CreateCertificadoDto } from '../dto/certificados/create-certificado.dto';
import type { RedeemCertificadoDto } from '../dto/certificados/redeem-certificado.dto';
import {
  CERTIFICATE_PROMOTIONS_REPOSITORY,
  type CertificateWithRelations,
  type ICertificatePromotionsRepository,
} from '../interfaces/certificate-promotions.repository';
import {
  decimalToNumber,
  fromDbCertificadoStatus,
  generateCertificadoSerial,
} from '../mappers/promotions.mapper';

@Injectable()
export class CertificatePromotionsService {
  constructor(
    @Inject(CERTIFICATE_PROMOTIONS_REPOSITORY)
    private readonly repository: ICertificatePromotionsRepository,
  ) {}

  async list() {
    const certificates = await this.repository.list();
    return certificates.map((certificate) => this.mapResponse(certificate));
  }

  async findBySerial(rawSerial: string) {
    const serial = this.normalizeSerial(rawSerial);
    if (!serial) throw new BadRequestException('Serial inválido');

    const certificate = await this.repository.findBySerial(serial);
    if (!certificate) {
      throw new NotFoundException(
        'No se encontró ningún certificado con este número.',
      );
    }

    return this.mapResponse(certificate);
  }

  async create(dto: CreateCertificadoDto) {
    const serial = dto.serial
      ? this.normalizeSerial(dto.serial)
      : generateCertificadoSerial('VC');
    const created = await this.repository.create({
      serial,
      origin: dto.origin,
      items: dto.items,
      description: dto.description ?? null,
      issueDate: new Date(),
      status: CertificadoStatus.DISPONIBLE,
      amount: dto.amount ?? null,
    });

    return this.mapResponse(created);
  }

  async markDelivered(id: number) {
    const certificate = await this.requireById(id);
    this.assertAvailable(certificate);

    const updated = await this.repository.update(id, {
      status: CertificadoStatus.ENTREGADO,
      redeemedAt: new Date(),
    });

    return this.mapResponse(updated);
  }

  async cancel(id: number) {
    const certificate = await this.requireById(id);
    if (certificate.status !== CertificadoStatus.DISPONIBLE) {
      throw new BadRequestException(
        'Solo se pueden anular certificados disponibles',
      );
    }

    const updated = await this.repository.update(id, {
      status: CertificadoStatus.ANULADO,
    });

    return this.mapResponse(updated);
  }

  async delete(id: number): Promise<void> {
    const existing = await this.repository.findById(id);
    if (!existing) return;

    await this.repository.delete(id);
  }

  async redeem(dto: RedeemCertificadoDto) {
    const serial = this.normalizeSerial(dto.serial);
    const certificate = await this.repository.findBySerial(serial);
    if (!certificate) {
      throw new NotFoundException(
        'No se encontró ningún certificado con este número.',
      );
    }

    this.assertAvailable(certificate);
    const updated = await this.repository.update(certificate.id, {
      status: CertificadoStatus.ENTREGADO,
      redeemedAt: new Date(),
      redeemedOrderId: dto.redeemedOrderId ?? null,
    });

    return this.mapResponse(updated);
  }

  private normalizeSerial(serial: string): string {
    return serial.trim().toUpperCase();
  }

  private async requireById(id: number): Promise<CertificateWithRelations> {
    const certificate = await this.repository.findById(id);
    if (!certificate) {
      throw new NotFoundException('Certificado no encontrado');
    }

    return certificate;
  }

  private assertAvailable(certificate: CertificateWithRelations): void {
    if (certificate.status === CertificadoStatus.DISPONIBLE) return;

    throw new BadRequestException(
      `Este certificado no puede usarse (Estado: ${fromDbCertificadoStatus(certificate.status)}).`,
    );
  }

  private mapResponse(certificate: CertificateWithRelations) {
    return {
      id: certificate.id,
      serial: certificate.serial,
      origin: certificate.origin,
      items: certificate.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
      })),
      issueDate: certificate.issueDate.toISOString().substring(0, 10),
      redeemedAt: certificate.redeemedAt?.toISOString(),
      description: certificate.description ?? undefined,
      status: fromDbCertificadoStatus(certificate.status),
      amount: certificate.amount
        ? decimalToNumber(certificate.amount)
        : undefined,
      redeemedOrderId: certificate.redeemedOrderId ?? undefined,
    };
  }
}
