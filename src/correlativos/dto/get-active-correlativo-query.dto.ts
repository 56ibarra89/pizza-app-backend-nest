import { DocumentType } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class GetActiveCorrelativoQueryDto {
  @IsEnum(DocumentType)
  documentType!: DocumentType;
}
