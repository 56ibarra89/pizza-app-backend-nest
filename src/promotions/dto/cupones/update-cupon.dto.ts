import {
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  ValidateBy,
} from 'class-validator';
import type {
  DiscountTypeDto,
  PromoStatusDto,
} from '../../mappers/promotions.mapper';

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
  @ValidateBy({
    name: 'maxPercentageUpdateCupon',
    validator: {
      validate: (value: unknown, args) =>
        (args?.object as UpdateCuponDto)?.discountType !== 'porcentaje' ||
        (typeof value === 'number' && value <= 100),
      defaultMessage: () => 'El porcentaje de descuento no puede superar 100',
    },
  })
  discountValue?: number;

  @IsOptional()
  @IsInt()
  maxUses?: number;

  @IsOptional()
  @IsInt()
  currentUses?: number;

  @IsOptional()
  @IsISO8601({ strict: true })
  expiresDate?: string | null;

  @IsOptional()
  @IsString()
  @IsIn(['Activo', 'Inactivo'] satisfies PromoStatusDto[])
  manualStatus?: PromoStatusDto;
}
