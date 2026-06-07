import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { OrderStatusDto } from './order-status.dto';

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatusDto)
  status!: OrderStatusDto;

  @IsOptional()
  @IsNumber()
  sentAt?: number;

  @IsOptional()
  @IsString()
  cancelReason?: string;

  @IsOptional()
  @IsString()
  cancelledById?: string;

  @IsOptional()
  @IsString()
  adminPin?: string;
}
