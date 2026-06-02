import { IsNotEmpty, IsNumber, IsOptional, IsString, IsDateString } from 'class-validator';

export class ReserveMesaDto {
  @IsString()
  @IsNotEmpty()
  reservationName!: string;

  @IsNumber()
  reservationAmount!: number;

  @IsOptional()
  @IsDateString()
  reservationTime?: string;

  @IsOptional()
  @IsDateString()
  expirationTime?: string;
}
