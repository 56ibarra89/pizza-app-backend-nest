import { CorrelativoStatus, DocumentType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateCorrelativoDto {
  @IsEnum(DocumentType)
  documentType!: DocumentType;

  @IsString()
  @IsNotEmpty()
  resolutionNumber!: string;

  @IsOptional()
  @IsString()
  prefix?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  startNumber!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  endNumber!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  currentNumber?: number;

  @IsDateString()
  issueDate!: string;

  @IsDateString()
  expirationDate!: string;

  @IsEnum(CorrelativoStatus)
  status!: CorrelativoStatus;
}
