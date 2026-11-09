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

export class CreateCuponDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsIn(['porcentaje', 'monto_fijo'] satisfies DiscountTypeDto[])
  discountType!: DiscountTypeDto;

  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  @ValidateBy({
    name: 'maxPercentageCupon',
    validator: {
      validate: (value: unknown, args) =>
        (args?.object as CreateCuponDto)?.discountType !== 'porcentaje' ||
        (typeof value === 'number' && value <= 100),
      defaultMessage: () => 'El porcentaje de descuento no puede superar 100',
    },
  })
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
