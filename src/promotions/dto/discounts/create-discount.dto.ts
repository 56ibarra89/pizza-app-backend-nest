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

export class CreateDiscountDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsIn(['Porcentaje', 'Monto Fijo'])
  type!: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  @ValidateBy({
    name: 'maxPercentageDiscount',
    validator: {
      validate: (value: unknown, args) =>
        (args?.object as CreateDiscountDto)?.type !== 'Porcentaje' ||
        (typeof value === 'number' && value <= 100),
      defaultMessage: () => 'El porcentaje no puede superar 100',
    },
  })
  value!: number;

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
