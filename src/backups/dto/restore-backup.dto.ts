import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class RestoreBackupDto {
  @ApiProperty({ description: 'Nombre del archivo existente a restaurar', required: false })
  @IsOptional()
  @IsString()
  filename?: string;
}

export class RestoreBackupResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty({ description: 'Nombre del archivo de snapshot de seguridad preventivo creado automáticamente' })
  safetySnapshot: string;

  @ApiProperty({ description: 'Archivo de origen desde el que se restauró el sistema' })
  restoredFrom: string;

  @ApiProperty({ description: 'Mensaje descriptivo del resultado' })
  message: string;
}
