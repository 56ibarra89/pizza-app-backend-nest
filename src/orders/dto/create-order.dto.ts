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
  ValidateNested,
} from 'class-validator';
import { CartItemDto } from './cart-item.dto';
import { OrderStatusDto } from './order-status.dto';
import { PaymentMethodDto } from './payment-method.dto';
import { OrderTypeDto } from './order-type.dto';
import { OrderPaymentDto } from './order-payment.dto';

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
  subTotal?: number;

  @IsOptional()
  @IsNumber()
  discountAmount?: number;

  @IsOptional()
  @IsNumber()
  taxAmount?: number;

  @IsNumber()
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
  @IsString()
  tableId?: string;

  @IsOptional()
  @IsInt()
  cuponId?: number;

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
}
