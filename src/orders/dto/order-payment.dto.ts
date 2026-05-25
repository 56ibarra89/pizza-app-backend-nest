import { IsEnum, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { PaymentMethodDto } from './payment-method.dto';

export class OrderPaymentDto {
  @IsEnum(PaymentMethodDto)
  method!: PaymentMethodDto;

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsOptional()
  @IsString()
  cashierId?: string;

  @IsOptional()
  @IsString()
  cashierSnapshotName?: string;
}
