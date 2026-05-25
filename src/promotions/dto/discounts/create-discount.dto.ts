import { IsArray, IsIn, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Max, ValidateIf } from 'class-validator';
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
  @ValidateIf((o: CreateDiscountDto) => o.type === 'Porcentaje')
  @Max(100)
  value!: number;

  @IsOptional()
  @IsString()
  @IsIn(['Activo', 'Inactivo'] satisfies PromoStatusDto[])
  status?: PromoStatusDto;

  /** IDs de productos a los que aplica (N:M). */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  productIds?: string[];

  /** IDs de categorías a las que aplica (N:M). */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categoryIds?: string[];
}
