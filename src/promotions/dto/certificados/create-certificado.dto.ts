import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateCertificadoDto {
  @IsString()
  @IsNotEmpty()
  origin!: string;

  @IsString()
  @IsNotEmpty()
  product!: string;

  // Código de canje (si no se envía, se genera)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  serial?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
