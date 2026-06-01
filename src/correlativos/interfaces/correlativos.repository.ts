import type { CorrelativoStatus, DocumentType } from '@prisma/client';
import type { CorrelativoEntity } from '../entities/correlativo.entity';

export const CORRELATIVOS_REPOSITORY = Symbol('CORRELATIVOS_REPOSITORY');

export interface ICorrelativosRepository {
  getAll(): Promise<CorrelativoEntity[]>;
  findActiveByDocumentType(documentType: DocumentType): Promise<CorrelativoEntity | null>;
  create(params: {
    documentType: DocumentType;
    resolutionNumber: string;
    prefix: string;
    startNumber: number;
    endNumber: number;
    currentNumber: number;
    issueDate: Date;
    expirationDate: Date;
    status: CorrelativoStatus;
  }): Promise<CorrelativoEntity>;
  update(id: string, params: {
    documentType?: DocumentType;
    resolutionNumber?: string;
    prefix?: string;
    startNumber?: number;
    endNumber?: number;
    currentNumber?: number;
    issueDate?: Date;
    expirationDate?: Date;
    status?: CorrelativoStatus;
  }): Promise<CorrelativoEntity>;
  markActiveAsVencido(documentType: DocumentType): Promise<void>;
  consumeNext(documentType: DocumentType): Promise<{
    correlativoId: string;
    resolutionNumber: string;
    prefix: string;
    issuedNumber: number;
    nextNumber: number;
    status: CorrelativoStatus;
  }>;
  deleteById(id: string): Promise<void>;
}
