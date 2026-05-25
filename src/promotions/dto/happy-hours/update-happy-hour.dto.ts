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
  Max,
  ValidateIf,
} from 'class-validator';
import { WeekDay } from '@prisma/client';
import type { HappyHourPromotionTypeDto, PromoStatusDto } from '../../mappers/promotions.mapper';

export class UpdateHappyHourDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(WeekDay, { each: true })
  daysOfWeek?: WeekDay[];

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  startTime?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  endTime?: string;

  @IsOptional()
  @IsString()
  @IsIn(['2x1', 'porcentaje', 'monto_fijo'] satisfies HappyHourPromotionTypeDto[])
  promotionType?: HappyHourPromotionTypeDto;

  @IsOptional()
  @ValidateIf((o: UpdateHappyHourDto) => o.promotionType !== '2x1')
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  @ValidateIf((o: UpdateHappyHourDto) => o.promotionType === 'porcentaje')
  @Max(100)
  promotionValue?: number;

  @IsOptional()
  @ValidateIf((o: UpdateHappyHourDto) => o.promotionType === '2x1')
  @IsString()
  @IsNotEmpty()
  appliesTo?: string;

  /** Reemplaza los productos asociados a esta promoción (N:M). */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  productIds?: string[];

  /** Reemplaza las categorías asociadas a esta promoción (N:M). */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categoryIds?: string[];

  @IsOptional()
  @IsString()
  @IsIn(['Activo', 'Inactivo'] satisfies PromoStatusDto[])
  status?: PromoStatusDto;
}
