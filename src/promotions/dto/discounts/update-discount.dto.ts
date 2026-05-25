import { IsArray, IsIn, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Max, ValidateIf } from 'class-validator';
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
  @ValidateIf((o: UpdateDiscountDto) => o.type === 'Porcentaje')
  @Max(100)
  value?: number;

  @IsOptional()
  @IsString()
  @IsIn(['Activo', 'Inactivo'] satisfies PromoStatusDto[])
  status?: PromoStatusDto;

  /** Reemplaza los productos asociados (N:M). */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  productIds?: string[];

  /** Reemplaza las categorías asociadas (N:M). */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categoryIds?: string[];
}
