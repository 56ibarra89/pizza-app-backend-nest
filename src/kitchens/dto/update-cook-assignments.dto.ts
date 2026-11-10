import { Type } from 'class-transformer';
import { WeekDay } from '@prisma/client';
import {
  IsArray,
  IsEnum,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class CookKitchenAssignmentDto {
  @IsEnum(WeekDay)
  dayOfWeek!: WeekDay;

  @IsOptional()
  @IsUUID()
  kitchenId!: string | null;
}

export class UpdateCookAssignmentsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CookKitchenAssignmentDto)
  assignments!: CookKitchenAssignmentDto[];
}
