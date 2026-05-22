import { LogLevel } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateSystemLogDto {
  @IsString()
  user!: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsString()
  role?: string;

  @IsString()
  action!: string;

  @IsOptional()
  @IsString()
  details?: string;

  @IsOptional()
  @IsEnum(LogLevel)
  level?: LogLevel;
}
