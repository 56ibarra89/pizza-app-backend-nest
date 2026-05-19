import { IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateCustomerDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  phone?: string;
}
