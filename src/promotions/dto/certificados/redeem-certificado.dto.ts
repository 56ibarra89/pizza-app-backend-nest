import { IsNotEmpty, IsString } from 'class-validator';

export class RedeemCertificadoDto {
  @IsString()
  @IsNotEmpty()
  serial!: string;
}
