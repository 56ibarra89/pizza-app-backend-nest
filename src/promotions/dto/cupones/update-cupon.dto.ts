import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Min } from 'class-validator';
import type { DiscountTypeDto, PromoStatusDto } from '../../mappers/promotions.mapper';

export class UpdateCuponDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  code?: string;

  @IsOptional()
  @IsString()
  @IsIn(['porcentaje', 'monto_fijo'] satisfies DiscountTypeDto[])
  discountType?: DiscountTypeDto;

  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d+)?$/)
  discountValue?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxUses?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  currentUses?: number;

  @IsOptional()
  @IsString()
  @Matches(/^(|\d{4}-\d{2}-\d{2})$/)
  expiresDate?: string;

  @IsOptional()
  @IsString()
  @IsIn(['Activo', 'Inactivo'] satisfies PromoStatusDto[])
  manualStatus?: PromoStatusDto;
}
