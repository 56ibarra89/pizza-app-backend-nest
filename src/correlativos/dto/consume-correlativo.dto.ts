import { DocumentType } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class ConsumeCorrelativoDto {
  @IsEnum(DocumentType)
  documentType!: DocumentType;
}
