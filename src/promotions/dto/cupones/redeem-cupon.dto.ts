import { IsNotEmpty, IsString } from 'class-validator';

export class RedeemCuponDto {
  @IsString()
  @IsNotEmpty()
  code!: string;
}
