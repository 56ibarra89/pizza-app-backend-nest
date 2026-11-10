import { Transform } from 'class-transformer';
import { IsDateString, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateUserExtraDayDto {
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  notes?: string;
}
