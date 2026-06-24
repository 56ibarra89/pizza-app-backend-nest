import { IsEnum, IsNumber, IsOptional, Min, IsString } from 'class-validator';
import { PaymentMethodDto } from './payment-method.dto';

export class OrderPaymentDto {
  @IsEnum(PaymentMethodDto)
  method!: PaymentMethodDto;

  @IsNumber()
  @Min(0)
  amount!: number;

  @IsOptional()
  @IsString()
  cashierId?: string;

  @IsOptional()
  @IsString()
  cashierSnapshotName?: string;
}
