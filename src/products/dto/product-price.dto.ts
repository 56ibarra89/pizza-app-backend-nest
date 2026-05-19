import { Type } from 'class-transformer';
import { IsEnum, IsNumber, Min } from 'class-validator';
import { ProductSizeDto } from './product-size.dto';

export class ProductPriceDto {
  @IsEnum(ProductSizeDto)
  size!: ProductSizeDto;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price!: number;
}
