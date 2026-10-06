import { Type } from 'class-transformer';
import {
  IsArray,
  ArrayMaxSize,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { SelectedExtraDto } from './selected-extra.dto';
import { KitchenStatusDto } from './kitchen-status.dto';

export enum KitchenModifierKindDto {
  REMOVE = 'REMOVE',
  ADD = 'ADD',
  PREPARATION = 'PREPARATION',
  SERVICE = 'SERVICE',
}

export class KitchenModifierSelectionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  id!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  label!: string;

  @IsEnum(KitchenModifierKindDto)
  kind!: KitchenModifierKindDto;
}

export class ComboSelectionDto {
  @IsString()
  @IsNotEmpty()
  groupId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  groupName!: string;

  @IsString()
  @IsNotEmpty()
  productId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  productName!: string;

  @IsOptional()
  @IsString()
  size?: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsNumber()
  @Min(0)
  extraPrice!: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => SelectedExtraDto)
  extras?: SelectedExtraDto[];

  @IsOptional()
  @IsString()
  kitchenId?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  categoryName?: string;

  @IsOptional()
  @IsEnum(KitchenStatusDto)
  kitchenStatus?: KitchenStatusDto;
}

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

  @IsString()
  @IsNotEmpty()
  size!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SelectedExtraDto)
  extras!: SelectedExtraDto[];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => KitchenModifierSelectionDto)
  kitchenModifiers?: KitchenModifierSelectionDto[];

  @IsOptional()
  @IsInt()
  @Min(0)
  giftQuantity?: number;

  @IsOptional()
  @IsString()
  giftReason?: string;

  @IsOptional()
  @IsBoolean()
  isSentToKitchen?: boolean;

  @IsOptional()
  @IsNumber()
  sentAt?: number;

  @IsOptional()
  @IsString()
  kitchenId?: string;

  @IsOptional()
  @IsEnum(KitchenStatusDto)
  kitchenStatus?: KitchenStatusDto;

  @IsOptional()
  @IsBoolean()
  isCombo?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ComboSelectionDto)
  comboSelections?: ComboSelectionDto[];
}
