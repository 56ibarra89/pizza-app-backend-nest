import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { SelectedExtraDto } from './selected-extra.dto';
import { ProductSizeDto } from './product-size.dto';
import { KitchenStatusDto } from './kitchen-status.dto';

export class CartItemDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  productId?: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsNumber()
  @Min(0)
  price!: number;

  @IsEnum(ProductSizeDto)
  size!: ProductSizeDto;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SelectedExtraDto)
  extras!: SelectedExtraDto[];

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  giftQuantity?: number;

  @IsOptional()
  @IsBoolean()
  isSentToKitchen?: boolean;

  @IsOptional()
  @IsNumber()
  sentAt?: number; // epoch ms

  @IsOptional()
  @IsEnum(KitchenStatusDto)
  kitchenStatus?: KitchenStatusDto;
}
