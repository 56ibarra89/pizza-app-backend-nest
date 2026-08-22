import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export const CASH_DENOMINATIONS = [
  1000, 500, 200, 100, 50, 20, 10, 5, 1, 0.5,
] as const;

export class CashDenominationCountDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsIn(CASH_DENOMINATIONS)
  denomination!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantity!: number;
}

export class CloseShiftDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  closingAmount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  discrepancyReason?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4,12}$/)
  authorizationPin?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(CASH_DENOMINATIONS.length)
  @ValidateNested({ each: true })
  @Type(() => CashDenominationCountDto)
  denominationBreakdown?: CashDenominationCountDto[];
}
