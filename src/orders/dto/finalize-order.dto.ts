import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { PaymentMethodDto } from './payment-method.dto';
import { SplitAmountsDto } from './split-amounts.dto';
import { OrderTypeDto } from './order-type.dto';

export class FinalizeOrderDto {
  @IsEnum(PaymentMethodDto)
  paymentMethod!: PaymentMethodDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => SplitAmountsDto)
  splitAmounts?: SplitAmountsDto;

  @IsOptional()
  @IsString()
  customerName?: string;

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
  @IsString()
  promotionCode?: string;
}
