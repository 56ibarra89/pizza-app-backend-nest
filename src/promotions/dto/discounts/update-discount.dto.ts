import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
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
  @IsString()
  @IsNotEmpty()
  value?: string;

  @IsOptional()
  @IsString()
  @IsIn(['Activo', 'Inactivo'] satisfies PromoStatusDto[])
  status?: PromoStatusDto;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  appliesTo?: string;
}
