import { Type } from 'class-transformer';
import { IsNumber, IsOptional, Min } from 'class-validator';

export class CloseShiftPreviewQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  countedCash?: number;
}
