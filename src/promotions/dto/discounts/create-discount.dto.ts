import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import type { PromoStatusDto } from '../../mappers/promotions.mapper';

export class CreateDiscountDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  // Frontend usa: "Porcentaje" | "Monto Fijo"
  @IsString()
  @IsIn(['Porcentaje', 'Monto Fijo'])
  type!: string;

  // Frontend guarda: "20%" o "C$150.00" (aceptamos cualquier string y parseamos)
  @IsString()
  @IsNotEmpty()
  value!: string;

  @IsOptional()
  @IsString()
  @IsIn(['Activo', 'Inactivo'] satisfies PromoStatusDto[])
  status?: PromoStatusDto;

  @IsString()
  @IsNotEmpty()
  appliesTo!: string;
}
