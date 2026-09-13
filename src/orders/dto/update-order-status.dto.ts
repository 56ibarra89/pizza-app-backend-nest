import { IsEnum, IsNumber, IsOptional, IsString, Matches } from 'class-validator';
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
  @Matches(/^\d{6}$/)
  adminPin?: string;

  @IsOptional()
  @IsString()
  kitchenId?: string;

  @IsOptional()
  @IsNumber()
  itemId?: number;
}
