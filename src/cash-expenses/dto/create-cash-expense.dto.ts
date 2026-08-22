import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';
import { CashExpenseCategoryDto } from './cash-expense-category.dto';

export class CreateCashExpenseDto {
  @IsNumber()
  @IsPositive({ message: 'El monto del gasto debe ser mayor que 0' })
  amount!: number;

  @IsEnum(CashExpenseCategoryDto, {
    message: 'La categoría especificada no es válida',
  })
  category!: CashExpenseCategoryDto;

  @IsString()
  @IsNotEmpty({ message: 'El motivo o justificación del gasto es obligatorio' })
  @MaxLength(255)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  voucherNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsString()
  shiftId?: string;
}
