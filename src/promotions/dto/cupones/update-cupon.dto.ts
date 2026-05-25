import { IsIn, IsInt, IsISO8601, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Max, ValidateIf } from 'class-validator';
import type { DiscountTypeDto, PromoStatusDto } from '../../mappers/promotions.mapper';

export class UpdateCuponDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  code?: string;

  @IsOptional()
  @IsString()
  @IsIn(['porcentaje', 'monto_fijo'] satisfies DiscountTypeDto[])
  discountType?: DiscountTypeDto;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  @ValidateIf((o: UpdateCuponDto) => o.discountType === 'porcentaje')
  @Max(100)
  discountValue?: number;

  @IsOptional()
  @IsInt()
  maxUses?: number;

  @IsOptional()
  @IsInt()
  currentUses?: number;

  /** ISO 8601 date. Enviar null explícito para quitar el vencimiento. */
  @IsOptional()
  @IsISO8601({ strict: true })
  expiresDate?: string | null;

  @IsOptional()
  @IsString()
  @IsIn(['Activo', 'Inactivo'] satisfies PromoStatusDto[])
  manualStatus?: PromoStatusDto;
}
