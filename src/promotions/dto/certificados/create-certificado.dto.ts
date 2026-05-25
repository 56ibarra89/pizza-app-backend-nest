import { Type } from 'class-transformer';
import { IsArray, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class CertificadoItemDto {
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;
}

export class CreateCertificadoDto {
  @IsString()
  @IsNotEmpty()
  origin!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CertificadoItemDto)
  items!: CertificadoItemDto[];

  @IsOptional()
  @IsInt()
  @Min(0)
  amount?: number;

  // Código de canje (si no se envía, se genera)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  serial?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
