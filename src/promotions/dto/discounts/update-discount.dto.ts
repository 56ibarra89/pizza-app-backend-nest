import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  ValidateBy,
} from 'class-validator';
import type { PromoStatusDto } from '../../mappers/promotions.mapper';

export class UpdateDiscountDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  @IsIn(['Porcentaje', 'Monto Fijo'])
  type?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  @ValidateBy({
    name: 'maxPercentageUpdateDiscount',
    validator: {
      validate: (value: unknown, args) =>
        (args?.object as UpdateDiscountDto)?.type !== 'Porcentaje' ||
        (typeof value === 'number' && value <= 100),
      defaultMessage: () => 'El porcentaje no puede superar 100',
    },
  })
  value?: number;

  @IsOptional()
  @IsString()
  @IsIn(['Activo', 'Inactivo'] satisfies PromoStatusDto[])
  status?: PromoStatusDto;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  productIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categoryIds?: string[];
}
