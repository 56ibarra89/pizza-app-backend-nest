import { ArrayNotEmpty, IsArray, IsIn, IsNotEmpty, IsOptional, IsString, Matches, ValidateIf } from 'class-validator';
import type { HappyHourPromotionTypeDto, PromoStatusDto } from '../../mappers/promotions.mapper';

export class UpdateHappyHourDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  daysOfWeek?: string[];

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
  @IsString()
  @Matches(/^\d+(\.\d+)?$/)
  promotionValue?: string;

  @IsOptional()
  @ValidateIf((o: UpdateHappyHourDto) => o.promotionType === '2x1')
  @IsString()
  @IsNotEmpty()
  appliesTo?: string;

  @IsOptional()
  @IsString()
  @IsIn(['Activo', 'Inactivo'] satisfies PromoStatusDto[])
  status?: PromoStatusDto;
}
