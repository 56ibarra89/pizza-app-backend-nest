import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRoleDto } from '../common';
import { BackupsService } from './backups.service';
import { BackupConfigDto, UpdateBackupConfigDto } from './dto/backup-config.dto';
import { BackupItemDto } from './dto/backup-item.dto';
import { RestoreBackupDto, RestoreBackupResponseDto } from './dto/restore-backup.dto';

@ApiTags('backups')
@Roles(UserRoleDto.admin)
@Controller('backups')
export class BackupsController {
  constructor(private readonly backupsService: BackupsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar todos los respaldos locales' })
  @ApiResponse({ status: 200, type: [BackupItemDto] })
  async list(): Promise<BackupItemDto[]> {
    return this.backupsService.listBackups();
  }

  @Post('generate')
  @ApiOperation({ summary: 'Generar un respaldo manual de la base de datos' })
  @ApiResponse({ status: 201, type: BackupItemDto })
  async generate(): Promise<BackupItemDto> {
    return this.backupsService.generateBackup('MANUAL');
  }

  @Get('config')
  @ApiOperation({ summary: 'Obtener configuración de respaldos automáticos y retención' })
  @ApiResponse({ status: 200, type: BackupConfigDto })
  async getConfig(): Promise<BackupConfigDto> {
    return this.backupsService.getConfig();
  }

  @Put('config')
  @ApiOperation({ summary: 'Actualizar configuración de respaldos' })
  @ApiResponse({ status: 200, type: BackupConfigDto })
  async updateConfig(
    @Body() dto: UpdateBackupConfigDto,
  ): Promise<BackupConfigDto> {
    return this.backupsService.updateConfig(dto);
  }

  @Get(':filename/download')
  @ApiOperation({ summary: 'Descargar archivo de respaldo' })
  async download(
    @Param('filename') filename: string,
    @Res() res: Response,
  ): Promise<void> {
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
  @ApiOperation({
    summary:
      'Restaurar la base de datos desde un archivo existente o subido. Crea automáticamente un Snapshot de Seguridad preventivo.',
  })
  @ApiConsumes('multipart/form-data', 'application/json')
  @UseInterceptors(FileInterceptor('file'))
  async restore(
    @Body() dto: RestoreBackupDto,
    @UploadedFile() file?: any,
  ): Promise<RestoreBackupResponseDto> {
    if (file) {
      if (!file.originalname?.endsWith('.sql')) {
        throw new BadRequestException('El archivo subido debe tener extensión .sql');
      }

      // Guardar en directorio temporal seguro
      const tempPath = path.join(
        os.tmpdir(),
        `uploaded_backup_${Date.now()}_${path.basename(file.originalname)}`,
      );

      if (file.buffer) {
        fs.writeFileSync(tempPath, file.buffer);
      } else if (file.path) {
        fs.copyFileSync(file.path, tempPath);
      }

      try {
        const result = await this.backupsService.restoreBackup({
          tempFilePath: tempPath,
        });
        return result;
      } finally {
        if (fs.existsSync(tempPath)) {
          try {
            fs.unlinkSync(tempPath);
          } catch {
            // ignore
          }
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
  @ApiOperation({ summary: 'Eliminar un archivo de respaldo del almacenamiento local' })
  async delete(@Param('filename') filename: string): Promise<{ success: boolean; message: string }> {
    await this.backupsService.deleteBackup(filename);
    return {
      success: true,
      message: `El archivo ${filename} fue eliminado exitosamente`,
    };
  }
}
