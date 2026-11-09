import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  ValidateBy,
  ValidateIf,
} from 'class-validator';
import { WeekDay } from '@prisma/client';
import type {
  HappyHourPromotionTypeDto,
  PromoStatusDto,
} from '../../mappers/promotions.mapper';

export class CreateHappyHourDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(WeekDay, { each: true })
  daysOfWeek!: WeekDay[];

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime!: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime!: string;

  @IsString()
  @IsIn([
    '2x1',
    'porcentaje',
    'monto_fijo',
  ] satisfies HappyHourPromotionTypeDto[])
  promotionType!: HappyHourPromotionTypeDto;

  @ValidateIf((o: CreateHappyHourDto) => o.promotionType !== '2x1')
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  @ValidateBy({
    name: 'maxPercentageHappyHour',
    validator: {
      validate: (value: unknown, args) =>
        (args?.object as CreateHappyHourDto)?.promotionType !== 'porcentaje' ||
        (typeof value === 'number' && value <= 100),
      defaultMessage: () => 'El porcentaje no puede superar 100',
    },
  })
  promotionValue?: number;

  @ValidateIf((o: CreateHappyHourDto) => o.promotionType === '2x1')
  @IsString()
  @IsNotEmpty()
  appliesTo?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  productIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categoryIds?: string[];

  @IsOptional()
  @IsString()
  @IsIn(['Activo', 'Inactivo'] satisfies PromoStatusDto[])
  status?: PromoStatusDto;
}
