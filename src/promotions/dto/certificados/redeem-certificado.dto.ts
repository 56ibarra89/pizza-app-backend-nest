import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RedeemCertificadoDto {
  @IsString()
  @IsNotEmpty()
  serial!: string;

  @IsOptional()
  @IsString()
  redeemedOrderId?: string;
}
