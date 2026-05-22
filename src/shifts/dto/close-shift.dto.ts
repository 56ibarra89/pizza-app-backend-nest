import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CloseShiftDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  closingAmount!: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
