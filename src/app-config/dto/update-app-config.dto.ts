import { IsDefined, IsOptional, IsString } from 'class-validator';

export class UpdateAppConfigDto {
  @IsDefined()
  data!: unknown;

  @IsOptional()
  @IsString()
  updatedById?: string;

  @IsOptional()
  @IsString()
  createdById?: string;
}
