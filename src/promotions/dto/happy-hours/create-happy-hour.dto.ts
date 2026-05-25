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

export class CreateHappyHourDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(WeekDay, { each: true })
  daysOfWeek!: WeekDay[];

  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  startTime!: string;

  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  endTime!: string;

  @IsString()
  @IsIn(['2x1', 'porcentaje', 'monto_fijo'] satisfies HappyHourPromotionTypeDto[])
  promotionType!: HappyHourPromotionTypeDto;

  /** Requerido cuando promotionType != '2x1'. Porcentaje máx 100. */
  @ValidateIf((o: CreateHappyHourDto) => o.promotionType !== '2x1')
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  @ValidateIf((o: CreateHappyHourDto) => o.promotionType === 'porcentaje')
  @Max(100)
  promotionValue?: number;

  /** Texto libre descriptivo del ítem cuando promotionType = '2x1'. */
  @ValidateIf((o: CreateHappyHourDto) => o.promotionType === '2x1')
  @IsString()
  @IsNotEmpty()
  appliesTo?: string;

  /** IDs de productos a los que aplica la promoción (N:M). */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  productIds?: string[];

  /** IDs de categorías a las que aplica la promoción (N:M). */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categoryIds?: string[];

  @IsOptional()
  @IsString()
  @IsIn(['Activo', 'Inactivo'] satisfies PromoStatusDto[])
  status?: PromoStatusDto;
}
