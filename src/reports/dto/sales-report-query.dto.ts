import { Transform } from 'class-transformer';
import { IsDateString, IsInt, Max, Min } from 'class-validator';

export class SalesReportQueryDto {
  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(-840)
  @Max(840)
  timezoneOffsetMinutes!: number;
}
