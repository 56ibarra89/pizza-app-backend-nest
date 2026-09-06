import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class BackupConfigDto {
  @ApiProperty({ description: 'Habilitar respaldo nocturno programado automático', default: true })
  @IsBoolean()
  enabled: boolean = true;

  @ApiProperty({ description: 'Hora de ejecución automática (0 - 23)', default: 3 })
  @IsInt()
  @Min(0)
  @Max(23)
  hour: number = 3;

  @ApiProperty({ description: 'Minuto de ejecución automática (0 - 59)', default: 0 })
  @IsInt()
  @Min(0)
  @Max(59)
  minute: number = 0;

  @ApiProperty({ description: 'Generar respaldo automático al cerrar turno de caja (Cierre Final)', default: true })
  @IsBoolean()
  backupOnShiftClose: boolean = true;

  @ApiProperty({ description: 'Días de retención para depuración automática (ej. 15, 30, 60)', default: 30 })
  @IsInt()
  @Min(1)
  retentionDays: number = 30;
}

export class UpdateBackupConfigDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  hour?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(59)
  minute?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  backupOnShiftClose?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  retentionDays?: number;
}
