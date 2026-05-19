import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsOptional, ValidateNested } from 'class-validator';
import { CartItemDto } from './cart-item.dto';

export class UpdateOrderItemsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CartItemDto)
  items!: CartItemDto[];

  @IsNumber()
  total!: number;

  @IsOptional()
  @IsNumber()
  subTotal?: number;

  @IsOptional()
  @IsNumber()
  taxAmount?: number;
}
