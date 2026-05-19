import { IsNumber } from 'class-validator';

export class SplitAmountsDto {
  @IsNumber()
  efectivo!: number;

  @IsNumber()
  tarjeta!: number;
}
