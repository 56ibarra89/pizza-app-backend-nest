import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  PayloadTooLargeException,
  Post,
  Put,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { Roles } from '../common/decorators/roles.decorator';
import { Permissions, UserRoleDto } from '../common';
import { BackupsService } from './backups.service';
import {
  BackupConfigDto,
  UpdateBackupConfigDto,
} from './dto/backup-config.dto';
import { BackupItemDto } from './dto/backup-item.dto';
import {
  RestoreBackupDto,
  RestoreBackupResponseDto,
} from './dto/restore-backup.dto';
import {
  backupUploadOptions,
  isSqlBackupFilename,
  MAX_BACKUP_UPLOAD_BYTES,
  MAX_BACKUP_UPLOAD_MB,
} from './backup-upload.config';

@ApiTags('backups')
@Roles(UserRoleDto.admin)
@Controller('backups')
export class BackupsController {
  constructor(private readonly backupsService: BackupsService) {}

  @Get()
  @Permissions('backups.read')
  @ApiOperation({ summary: 'Listar todos los respaldos locales' })
  @ApiResponse({ status: 200, type: [BackupItemDto] })
  async list(): Promise<BackupItemDto[]> {
    return this.backupsService.listBackups();
  }

  @Post('generate')
  @Permissions('backups.manage')
  @ApiOperation({ summary: 'Generar un respaldo manual de la base de datos' })
  @ApiResponse({ status: 201, type: BackupItemDto })
  async generate(): Promise<BackupItemDto> {
    return this.backupsService.generateBackup('MANUAL');
  }

  @Get('config')
  @Permissions('backups.read')
  @ApiOperation({
    summary: 'Obtener configuración de respaldos automáticos y retención',
  })
  @ApiResponse({ status: 200, type: BackupConfigDto })
  async getConfig(): Promise<BackupConfigDto> {
    return this.backupsService.getConfig();
  }

  @Put('config')
  @Permissions('backups.manage')
  @ApiOperation({ summary: 'Actualizar configuración de respaldos' })
  @ApiResponse({ status: 200, type: BackupConfigDto })
  async updateConfig(
    @Body() dto: UpdateBackupConfigDto,
  ): Promise<BackupConfigDto> {
    return this.backupsService.updateConfig(dto);
  }

  @Get(':filename/download')
  @Permissions('backups.read')
  @ApiOperation({ summary: 'Descargar archivo de respaldo' })
  download(@Param('filename') filename: string, @Res() res: Response): void {
    const filePath = this.backupsService.getBackupFilePath(filename);
    const sanitizedFilename = path.basename(filePath);

    res.setHeader('Content-Type', 'application/sql');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${sanitizedFilename}"`,
    );

    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  }

  @Post('restore')
  @Permissions('backups.manage')
  @ApiOperation({
    summary:
      'Restaurar la base de datos desde un archivo existente o subido. Crea automáticamente un Snapshot de Seguridad preventivo.',
  })
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiResponse({
    status: 413,
    description: `El archivo supera el límite de ${MAX_BACKUP_UPLOAD_MB} MB`,
  })
  @UseInterceptors(FileInterceptor('file', backupUploadOptions))
  async restore(
    @Body() dto: RestoreBackupDto,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<RestoreBackupResponseDto> {
    if (file) {
      const tempPath = file.path;

      try {
        if (!tempPath || !isSqlBackupFilename(file.originalname)) {
          throw new BadRequestException(
            'El archivo subido debe tener extensión .sql',
          );
        }

        const stat = await fs.promises.stat(tempPath);
        if (stat.size === 0) {
          throw new BadRequestException('El archivo de respaldo está vacío');
        }
        if (stat.size > MAX_BACKUP_UPLOAD_BYTES) {
          throw new PayloadTooLargeException(
            `El respaldo supera el límite de ${MAX_BACKUP_UPLOAD_MB} MB`,
          );
        }

        const result = await this.backupsService.restoreBackup({
          tempFilePath: tempPath,
        });
        return result;
      } finally {
        if (tempPath) {
          await fs.promises.unlink(tempPath).catch(() => {
            // El archivo pudo haber sido retirado previamente por Multer.
          });
        }
      }
    }

    if (!dto.filename) {
      throw new BadRequestException(
        'Debes especificar el nombre de un archivo del historial o subir un archivo .sql',
      );
    }

    return this.backupsService.restoreBackup({ filename: dto.filename });
  }

  @Delete(':filename')
  @Permissions('backups.manage')
  @ApiOperation({
    summary: 'Eliminar un archivo de respaldo del almacenamiento local',
  })
  async delete(
    @Param('filename') filename: string,
  ): Promise<{ success: boolean; message: string }> {
    await this.backupsService.deleteBackup(filename);
    return {
      success: true,
      message: `El archivo ${filename} fue eliminado exitosamente`,
    };
  }
}
