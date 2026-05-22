import type { CorrelativoStatus, DocumentType } from '@prisma/client';

export type CorrelativoEntity = {
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
};
