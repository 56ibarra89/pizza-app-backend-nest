import { ArrayNotEmpty, IsArray, IsIn, IsNotEmpty, IsOptional, IsString, Matches, ValidateIf } from 'class-validator';
import type { HappyHourPromotionTypeDto, PromoStatusDto } from '../../mappers/promotions.mapper';

export class CreateHappyHourDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  daysOfWeek!: string[];

  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  startTime!: string;

  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  endTime!: string;

  @IsString()
  @IsIn(['2x1', 'porcentaje', 'monto_fijo'] satisfies HappyHourPromotionTypeDto[])
  promotionType!: HappyHourPromotionTypeDto;

  @ValidateIf((o: CreateHappyHourDto) => o.promotionType !== '2x1')
  @IsString()
  @Matches(/^\d+(\.\d+)?$/)
  promotionValue!: string;

  @ValidateIf((o: CreateHappyHourDto) => o.promotionType === '2x1')
  @IsString()
  @IsNotEmpty()
  appliesTo!: string;

  @IsOptional()
  @IsString()
  @IsIn(['Activo', 'Inactivo'] satisfies PromoStatusDto[])
  status?: PromoStatusDto;
}
