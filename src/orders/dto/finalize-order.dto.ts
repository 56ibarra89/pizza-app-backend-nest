import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsInt, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { PaymentMethodDto } from './payment-method.dto';
import { OrderPaymentDto } from './order-payment.dto';
import { OrderTypeDto } from './order-type.dto';

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
  finalTotal?: number;

  @IsOptional()
  @IsNumber()
  subTotal?: number;

  @IsOptional()
  @IsNumber()
  discountAmount?: number;

  @IsOptional()
  @IsNumber()
  taxAmount?: number;

  @IsOptional()
  @IsInt()
  cuponId?: number;
}
