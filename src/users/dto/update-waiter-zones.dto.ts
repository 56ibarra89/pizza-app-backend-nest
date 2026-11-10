import { Type } from 'class-transformer';
import { WeekDay } from '@prisma/client';
import {
  IsArray,
  IsEnum,
  IsInt,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class WaiterZoneDto {
  @IsEnum(WeekDay)
  day!: WeekDay;

  @IsInt()
  @Min(1)
  @Max(100)
  floor!: number;
}

export class UpdateWaiterZonesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WaiterZoneDto)
  zones!: WaiterZoneDto[];
}
