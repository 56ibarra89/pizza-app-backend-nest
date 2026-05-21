import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Min } from 'class-validator';
import type { DiscountTypeDto, PromoStatusDto } from '../../mappers/promotions.mapper';

export class CreateCuponDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsIn(['porcentaje', 'monto_fijo'] satisfies DiscountTypeDto[])
  discountType!: DiscountTypeDto;

  @IsString()
  @Matches(/^\d+(\.\d+)?$/)
  discountValue!: string;

  @IsInt()
  @Min(0)
  maxUses!: number;

  @IsOptional()
  @IsString()
  // "" o YYYY-MM-DD
  @Matches(/^(|\d{4}-\d{2}-\d{2})$/)
  expiresDate?: string;

  @IsOptional()
  @IsString()
  @IsIn(['Activo', 'Inactivo'] satisfies PromoStatusDto[])
  manualStatus?: PromoStatusDto;
}
