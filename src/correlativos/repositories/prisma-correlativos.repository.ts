import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CorrelativoStatus, DocumentType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { ICorrelativosRepository } from '../interfaces/correlativos.repository';
import type { CorrelativoEntity } from '../entities/correlativo.entity';

@Injectable()
export class PrismaCorrelativosRepository implements ICorrelativosRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getAll(): Promise<CorrelativoEntity[]> {
    const rows = await this.prisma.correlativo.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.map(r));
  }

  async findActiveByDocumentType(
    documentType: DocumentType,
  ): Promise<CorrelativoEntity | null> {
    const row = await this.prisma.correlativo.findFirst({
      where: { documentType, status: CorrelativoStatus.ACTIVO },
      orderBy: { createdAt: 'desc' },
    });
    return row ? this.map(row) : null;
  }

  async markActiveAsVencido(documentType: DocumentType): Promise<void> {
    await this.prisma.correlativo.updateMany({
      where: { documentType, status: CorrelativoStatus.ACTIVO },
      data: { status: CorrelativoStatus.VENCIDO },
    });
  }

  async create(params: {
    documentType: DocumentType;
    resolutionNumber: string;
    prefix: string;
    startNumber: number;
    endNumber: number;
    currentNumber: number;
    issueDate: Date;
    expirationDate: Date;
    status: CorrelativoStatus;
  }): Promise<CorrelativoEntity> {
    const created = await this.prisma.correlativo.create({
      data: params,
    });
    return this.map(created);
  }

  async consumeNext(documentType: DocumentType): Promise<{
    correlativoId: string;
    resolutionNumber: string;
    prefix: string;
    issuedNumber: number;
    nextNumber: number;
    status: CorrelativoStatus;
  }> {
    return this.prisma.$transaction(async (tx) => {
      const active = await tx.correlativo.findFirst({
        where: { documentType, status: CorrelativoStatus.ACTIVO },
        orderBy: { createdAt: 'desc' },
      });

      if (!active) {
        throw new NotFoundException('No hay correlativo ACTIVO para ese tipo de documento');
      }

      const now = new Date();
      if (active.expirationDate < now) {
        await tx.correlativo.update({
          where: { id: active.id },
          data: { status: CorrelativoStatus.VENCIDO },
        });
        throw new BadRequestException('El correlativo está VENCIDO');
      }

      const issuedNumber = active.currentNumber;
      if (issuedNumber > active.endNumber) {
        await tx.correlativo.update({
          where: { id: active.id },
          data: { status: CorrelativoStatus.AGOTADO },
        });
        throw new BadRequestException('El correlativo está AGOTADO');
      }

      const nextNumber = issuedNumber + 1;
      const newStatus = nextNumber > active.endNumber ? CorrelativoStatus.AGOTADO : active.status;

      await tx.correlativo.update({
        where: { id: active.id },
        data: {
          currentNumber: nextNumber,
          status: newStatus,
        },
      });

      return {
        correlativoId: active.id,
        resolutionNumber: active.resolutionNumber,
        prefix: active.prefix,
        issuedNumber,
        nextNumber,
        status: newStatus,
      };
    });
  }

  async deleteById(id: string): Promise<void> {
    await this.prisma.correlativo.delete({ where: { id } });
  }

  private map(row: {
    id: string;
    documentType: DocumentType;
    resolutionNumber: string;
    prefix: string;
    startNumber: number;
    endNumber: number;
    currentNumber: number;
    issueDate: Date;
    expirationDate: Date;
    status: CorrelativoStatus;
    createdAt: Date;
  }): CorrelativoEntity {
    return {
      id: row.id,
      documentType: row.documentType,
      resolutionNumber: row.resolutionNumber,
      prefix: row.prefix,
      startNumber: row.startNumber,
      endNumber: row.endNumber,
      currentNumber: row.currentNumber,
      issueDate: row.issueDate,
      expirationDate: row.expirationDate,
      status: row.status,
      createdAt: row.createdAt,
    };
  }
}
