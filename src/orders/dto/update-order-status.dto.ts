import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Matches,
  ValidateIf,
} from 'class-validator';
import { OrderStatusDto } from './order-status.dto';

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatusDto)
  status!: OrderStatusDto;

  @IsOptional()
  @IsNumber()
  sentAt?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  cancelReason?: string;

  @ValidateIf(
    (dto: UpdateOrderStatusDto) => dto.status === OrderStatusDto.cancelled,
  )
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]{0,79}$/)
  cancelReasonId?: string;

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
