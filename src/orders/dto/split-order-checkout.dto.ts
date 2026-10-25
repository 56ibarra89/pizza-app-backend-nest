import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CartItemDto } from './cart-item.dto';
import { FinalizeOrderDto } from './finalize-order.dto';

export type SplitBillModeDto = 'items' | 'equal' | 'custom';

export class SplitOrderCheckoutDto extends FinalizeOrderDto {
  @IsString()
  @IsIn(['items', 'equal', 'custom'])
  mode!: SplitBillModeDto;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  accountName!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CartItemDto)
  items!: CartItemDto[];

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  subAccountAmount?: number;
}
