import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateCertificadoDto {
  @IsString()
  @IsNotEmpty()
  origin!: string;

  @IsString()
  @IsNotEmpty()
  product!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
