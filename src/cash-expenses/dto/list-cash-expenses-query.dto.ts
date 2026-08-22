import { IsEnum, IsOptional, IsString } from 'class-validator';
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
}
