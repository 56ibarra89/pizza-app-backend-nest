import { IsIn, IsInt, IsISO8601, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Max, ValidateIf } from 'class-validator';
import type { DiscountTypeDto, PromoStatusDto } from '../../mappers/promotions.mapper';

export class CreateCuponDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsIn(['porcentaje', 'monto_fijo'] satisfies DiscountTypeDto[])
  discountType!: DiscountTypeDto;

  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  @ValidateIf((o: CreateCuponDto) => o.discountType === 'porcentaje')
  @Max(100)
  discountValue!: number;

  @IsInt()
  @IsOptional()
  maxUses?: number;

  @IsOptional()
  @IsISO8601({ strict: true })
  expiresDate?: string;

  @IsOptional()
  @IsString()
  @IsIn(['Activo', 'Inactivo'] satisfies PromoStatusDto[])
  manualStatus?: PromoStatusDto;
}

