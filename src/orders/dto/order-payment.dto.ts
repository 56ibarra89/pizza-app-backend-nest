import {
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Min,
} from 'class-validator';
import { PaymentMethodDto } from './payment-method.dto';

export class OrderPaymentDto {
  @IsEnum(PaymentMethodDto)
  method!: PaymentMethodDto;

  @IsNumber()
  @Min(0)
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  methodConfigId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  originalAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.0001)
  exchangeRate?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  methodSnapshotName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  methodType?: string;

  @IsOptional()
  @IsString()
  @IsIn(['NIO', 'USD'])
  currency?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  commissionRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  commissionAmount?: number;

  @IsOptional()
  @IsString()
  cashierId?: string;

  @IsOptional()
  @IsString()
  cashierSnapshotName?: string;
}
