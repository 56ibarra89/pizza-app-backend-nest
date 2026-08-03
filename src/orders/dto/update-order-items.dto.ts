import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { CartItemDto } from './cart-item.dto';
import { OrderPromotionSourceDto } from './order-promotion-source.dto';

export class UpdateOrderItemsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CartItemDto)
  items!: CartItemDto[];

  @IsNumber()
  @Min(0)
  total!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  subTotal?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  taxAmount?: number;

  @IsOptional()
  @IsInt()
  cuponId?: number;

  @IsOptional()
  @IsString()
  promotionCode?: string;

  @IsOptional()
  @IsEnum(OrderPromotionSourceDto)
  promotionSource?: OrderPromotionSourceDto;

  @IsOptional()
  @IsInt()
  discountId?: number;

  @IsOptional()
  @IsInt()
  happyHourId?: number;

  @IsOptional()
  @IsBoolean()
  isSentToKitchen?: boolean;
}
