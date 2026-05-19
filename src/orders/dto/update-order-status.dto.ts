import { IsEnum, IsNumber, IsOptional } from 'class-validator';
import { OrderStatusDto } from './order-status.dto';

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatusDto)
  status!: OrderStatusDto;

  @IsOptional()
  @IsNumber()
  sentAt?: number;
}
