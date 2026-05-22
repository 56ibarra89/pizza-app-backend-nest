import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class OpenShiftDto {
  @IsString()
  @IsNotEmpty()
  cashierName!: string;

  @IsOptional()
  @IsUUID()
  cashierId?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  openingAmount!: number;

  @IsOptional()
  @IsString()
  cashRegisterName?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
