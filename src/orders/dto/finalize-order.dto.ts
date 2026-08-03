import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { OrderPaymentDto } from './order-payment.dto';
import { OrderTypeDto } from './order-type.dto';
import { OrderStatusDto } from './order-status.dto';
import { OrderPromotionSourceDto } from './order-promotion-source.dto';

export class FinalizeOrderDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderPaymentDto)
  payments?: OrderPaymentDto[];

  @IsOptional()
  @IsString()
  customerSnapshotName?: string;

  @IsOptional()
  @IsEnum(OrderTypeDto)
  orderType?: OrderTypeDto;

  @IsOptional()
  @IsString()
  customerAddress?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  finalTotal?: number;

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
  @IsArray()
  @IsString({ each: true })
  certificateSerials?: string[];

  @IsOptional()
  @IsEnum(OrderStatusDto)
  status?: OrderStatusDto;
}
