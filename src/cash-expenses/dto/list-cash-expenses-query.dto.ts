import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { CashExpenseCategoryDto } from './cash-expense-category.dto';

export class ListCashExpensesQueryDto {
  @IsOptional()
  @IsString()
  shiftId?: string;

  @IsOptional()
  @IsString()
  cashierId?: string;

  @IsOptional()
  @IsEnum(CashExpenseCategoryDto)
  category?: CashExpenseCategoryDto;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}
