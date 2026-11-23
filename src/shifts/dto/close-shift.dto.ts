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
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export const CASH_DENOMINATIONS = [
  1000, 500, 200, 100, 50, 20, 10, 5, 1, 0.5,
] as const;

export const USD_CASH_DENOMINATIONS = [
  100, 50, 20, 10, 5, 2, 1, 0.5, 0.25, 0.1, 0.05, 0.01,
] as const;

class DenominationQuantityDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantity!: number;
}

export class CashDenominationCountDto extends DenominationQuantityDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsIn(CASH_DENOMINATIONS)
  denomination!: number;
}

export class UsdDenominationCountDto extends DenominationQuantityDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsIn(USD_CASH_DENOMINATIONS)
  denomination!: number;
}

export class CloseShiftDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  closingAmount!: number;

  @ValidateIf((_object, value) => value !== undefined)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  countedUsd?: number;

  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(0)
  declaredCardAmount?: number;

  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(0)
  declaredAppAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  discrepancyReason?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/)
  authorizationPin?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(CASH_DENOMINATIONS.length)
  @ValidateNested({ each: true })
  @Type(() => CashDenominationCountDto)
  denominationBreakdown?: CashDenominationCountDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(USD_CASH_DENOMINATIONS.length)
  @ValidateNested({ each: true })
  @Type(() => UsdDenominationCountDto)
  usdDenominationBreakdown?: UsdDenominationCountDto[];

  @IsOptional()
  @IsString()
  @IsIn(['HANDOVER', 'END_OF_DAY'])
  closeType?: 'HANDOVER' | 'END_OF_DAY';
}
