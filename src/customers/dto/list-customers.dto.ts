import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
export class ListCustomersDto {
  @Type(() => Number) @IsInt() @Min(0) page = 0;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 10;
  @IsOptional() @IsString() query?: string;
}
