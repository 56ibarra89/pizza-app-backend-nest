import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CloseShiftPreviewQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  countedCash?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  countedCard?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  countedApp?: number;

  @IsOptional()
  @IsString()
  @IsIn(['HANDOVER', 'END_OF_DAY'])
  closeType?: 'HANDOVER' | 'END_OF_DAY';
}
