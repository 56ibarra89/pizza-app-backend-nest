import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class OpenShiftDto {
  @IsString()
  @IsNotEmpty()
  cashierName!: string;

  @IsOptional()
  @IsUUID()
  cashierId?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99_999_999.99)
  openingAmount!: number;

  @IsOptional()
  @IsString()
  cashRegisterName?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
