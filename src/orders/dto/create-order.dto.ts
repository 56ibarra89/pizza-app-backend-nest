import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { CartItemDto } from './cart-item.dto';
import { OrderStatusDto } from './order-status.dto';
import { OrderTypeDto } from './order-type.dto';
import { OrderPaymentDto } from './order-payment.dto';
import { OrderPromotionSourceDto } from './order-promotion-source.dto';

export class CreateOrderDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  id?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  shiftId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  customerId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CartItemDto)
  items!: CartItemDto[];

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
  @IsNumber()
  @Min(0)
  customerTendered?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  deliveryChange?: number;

  @IsNumber()
  @Min(0)
  total!: number;

  @IsOptional()
  @IsEnum(OrderStatusDto)
  status?: OrderStatusDto;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  timestamp?: Date;

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
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderPaymentDto)
  payments?: OrderPaymentDto[];

  @IsOptional()
  @IsString()
  cashierSnapshotName?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  cashierId?: string;

  @IsOptional()
  @IsBoolean()
  isSentToKitchen?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  linkedTables?: string[];

  @IsOptional()
  @IsString()
  driverId?: string;
}
