import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const HISTORY_STATUSES = [
  'pending',
  'preparing',
  'ready',
  'delivered',
  'paid',
  'cancelled',
] as const;

function trimText(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function splitStatuses(value: unknown): unknown {
  return typeof value === 'string'
    ? value
        .split(',')
        .map((status) => status.trim().toLowerCase())
        .filter(Boolean)
    : value;
}

export class ListOrderHistoryQueryDto {
  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 25;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => trimText(value as unknown))
  search?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  paymentMethodId?: string;

  @IsOptional()
  @IsIn(['all', 'invoices'])
  view: 'all' | 'invoices' = 'all';

  @IsOptional()
  @Transform(({ value }) => splitStatuses(value as unknown))
  @IsIn(HISTORY_STATUSES, { each: true })
  statuses?: (typeof HISTORY_STATUSES)[number][];
}
