import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OnEvent } from '@nestjs/event-emitter';
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { AppConfigService } from '../app-config/services/app-config.service';
import { BackupConfigDto, UpdateBackupConfigDto } from './dto/backup-config.dto';
import { BackupItemDto, BackupType } from './dto/backup-item.dto';
import { RestoreBackupResponseDto } from './dto/restore-backup.dto';
import {
  CLOUD_BACKUP_PROVIDER,
  type ICloudBackupProvider,
} from './interfaces/cloud-backup-provider.interface';

const execFileAsync = promisify(execFile);
const CONFIG_KEY = 'backup_config';

@Injectable()
export class BackupsService implements OnModuleInit {
  private readonly logger = new Logger(BackupsService.name);
  private readonly storageDir = path.join(process.cwd(), 'storage', 'backups');
  private lastCronExecutionKey: string | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly appConfigService: AppConfigService,
    @Inject(CLOUD_BACKUP_PROVIDER)
    private readonly cloudProvider: ICloudBackupProvider,
  ) {}

  onModuleInit() {
    this.ensureStorageDir();
    const pgDump = this.resolveBinaryPath('pg_dump');
    const psql = this.resolveBinaryPath('psql');
    this.logger.log(`Directorio de respaldos listo: ${this.storageDir}`);
    this.logger.log(`Binario pg_dump detectado: ${pgDump || 'No encontrado'}`);
    this.logger.log(`Binario psql detectado: ${psql || 'No encontrado'}`);
  }

  /**
   * Asegura la existencia de la carpeta de almacenamiento de respaldos.
   */
  private ensureStorageDir(): void {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  /**
   * Resuelve la ruta ejecutable de binarios de PostgreSQL (pg_dump o psql).
   * Compatible con Windows, Linux y configuraciones por variables de entorno.
   */
  resolveBinaryPath(binaryName: 'pg_dump' | 'psql'): string {
    const envPath =
      binaryName === 'pg_dump'
        ? process.env.PG_DUMP_PATH
        : process.env.PSQL_PATH;
    if (envPath && fs.existsSync(envPath)) {
      return envPath;
    }

    const isWindows = process.platform === 'win32';
    const binaryExt = isWindows ? `${binaryName}.exe` : binaryName;

    if (isWindows) {
      // Rutas estándar de PostgreSQL en Windows
      const commonDirs = [
        'C:\\Program Files\\PostgreSQL\\18\\bin',
        'C:\\Program Files\\PostgreSQL\\17\\bin',
        'C:\\Program Files\\PostgreSQL\\16\\bin',
        'C:\\Program Files\\PostgreSQL\\15\\bin',
        'C:\\Program Files\\PostgreSQL\\14\\bin',
        'C:\\Program Files (x86)\\PostgreSQL\\18\\bin',
        'C:\\Program Files (x86)\\PostgreSQL\\17\\bin',
        'C:\\Program Files (x86)\\PostgreSQL\\16\\bin',
      ];

      for (const dir of commonDirs) {
        const fullPath = path.join(dir, binaryExt);
        if (fs.existsSync(fullPath)) {
          return fullPath;
        }
      }

      // Búsqueda dinámica en carpetas de Program Files
      try {
        const basePath = 'C:\\Program Files\\PostgreSQL';
        if (fs.existsSync(basePath)) {
          const subdirs = fs.readdirSync(basePath);
          for (const sub of subdirs) {
            const candidate = path.join(basePath, sub, 'bin', binaryExt);
            if (fs.existsSync(candidate)) {
              return candidate;
            }
          }
        }
      } catch (err) {
        this.logger.warn(`Error escaneando directorios de PostgreSQL: ${err}`);
      }
    }

    // Fallback: invocar por nombre directamente si está en PATH
    return binaryExt;
  }

  /**
   * Extrae los parámetros de conexión parseando DATABASE_URL.
   */
  private getDatabaseCredentials() {
    const rawUrl =
      this.configService.get<string>('DATABASE_URL') ||
      process.env.DATABASE_URL ||
      'postgresql://postgres:1234@localhost:5432/pizza_app?schema=public';

    try {
      const parsed = new URL(rawUrl);
      return {
        host: parsed.hostname || 'localhost',
        port: parsed.port || '5432',
        username: decodeURIComponent(parsed.username || 'postgres'),
        password: decodeURIComponent(parsed.password || ''),
        database: parsed.pathname.replace(/^\//, '') || 'pizza_app',
      };
    } catch {
      return {
        host: 'localhost',
        port: '5432',
        username: 'postgres',
        password: '',
        database: 'pizza_app',
      };
    }
  }

  /**
   * Obtiene la configuración actual de respaldos desde AppConfig.
   */
  async getConfig(): Promise<BackupConfigDto> {
    const stored = await this.appConfigService.getByIdOrDefault(CONFIG_KEY);
    const data = (stored?.data as Partial<BackupConfigDto>) || {};

    return {
      enabled: typeof data.enabled === 'boolean' ? data.enabled : true,
      hour: typeof data.hour === 'number' ? data.hour : 3,
      minute: typeof data.minute === 'number' ? data.minute : 0,
      backupOnShiftClose:
        typeof data.backupOnShiftClose === 'boolean'
          ? data.backupOnShiftClose
          : true,
      retentionDays:
        typeof data.retentionDays === 'number' ? data.retentionDays : 30,
    };
  }

  /**
   * Actualiza y persiste la configuración de respaldos.
   */
  async updateConfig(dto: UpdateBackupConfigDto): Promise<BackupConfigDto> {
    const current = await this.getConfig();
    const updated: BackupConfigDto = {
      enabled: dto.enabled !== undefined ? dto.enabled : current.enabled,
      hour: dto.hour !== undefined ? dto.hour : current.hour,
      minute: dto.minute !== undefined ? dto.minute : current.minute,
      backupOnShiftClose:
        dto.backupOnShiftClose !== undefined
          ? dto.backupOnShiftClose
          : current.backupOnShiftClose,
      retentionDays:
        dto.retentionDays !== undefined
          ? dto.retentionDays
          : current.retentionDays,
    };

    await this.appConfigService.upsert(CONFIG_KEY, { data: updated });
    this.logger.log('Configuración de respaldos actualizada correctamente');
    return updated;
  }

  /**
   * Genera un nuevo archivo de respaldo PostgreSQL con el tipo especificado.
   */
  async generateBackup(type: BackupType = 'MANUAL'): Promise<BackupItemDto> {
    this.ensureStorageDir();
    const creds = this.getDatabaseCredentials();
    const pgDumpPath = this.resolveBinaryPath('pg_dump');

    const now = new Date();
    const timestamp = now
      .toISOString()
      .replace(/T/, '_')
      .replace(/:/g, '-')
      .replace(/\..+/, '');

    let prefix = 'backup-manual';
    if (type === 'AUTOMATIC') prefix = 'backup-auto';
    if (type === 'SHIFT_CLOSE') prefix = 'backup-shift-close';
    if (type === 'SAFETY_SNAPSHOT') prefix = 'safety-snapshot';

    const filename = `${prefix}_${timestamp}.sql`;
    const destinationPath = path.join(this.storageDir, filename);

    const args = [
      '-h',
      creds.host,
      '-p',
      creds.port,
      '-U',
      creds.username,
      '-d',
      creds.database,
      '--schema=public',
      '--clean',
      '--if-exists',
      '--no-owner',
      '--no-privileges',
      '-f',
      destinationPath,
    ];

    try {
      this.logger.log(`Generando respaldo [${type}]: ${filename}...`);
      await execFileAsync(pgDumpPath, args, {
        env: {
          ...process.env,
          PGPASSWORD: creds.password,
        },
      });

      const stat = fs.statSync(destinationPath);
      const sizeBytes = stat.size;
      const sizeMb = parseFloat((sizeBytes / (1024 * 1024)).toFixed(2));

      this.logger.log(
        `Respaldo generado con éxito: ${filename} (${sizeMb} MB)`,
      );

      // Despacho a proveedor en la nube (LocalFirst maneja retorno seguro)
      try {
        await this.cloudProvider.upload(destinationPath, filename);
      } catch (cloudErr) {
        this.logger.warn(
          `Advertencia al sincronizar con proveedor de nube: ${cloudErr}`,
        );
      }

      // Aplicar política de retención para depurar copias viejas
      this.cleanExpiredBackups().catch((err) => {
        this.logger.error(`Error al aplicar política de retención: ${err}`);
      });

      return {
        filename,
        sizeBytes,
        sizeMb,
        createdAt: now,
        type,
        location: 'LOCAL',
      };
    } catch (err: any) {
      this.logger.error(`Fallo al ejecutar pg_dump: ${err?.message || err}`);
      if (fs.existsSync(destinationPath)) {
        try {
          fs.unlinkSync(destinationPath);
        } catch {
          // ignore
        }
      }
      throw new InternalServerErrorException(
        `Error al generar el respaldo de la base de datos: ${err?.message || 'Error en pg_dump'}`,
      );
    }
  }

  /**
   * Lista todos los archivos de respaldo almacenados localmente con sus metadatos.
   */
  async listBackups(): Promise<BackupItemDto[]> {
    this.ensureStorageDir();
    const files = fs.readdirSync(this.storageDir);

    const backupList: BackupItemDto[] = [];

    for (const filename of files) {
      if (!filename.endsWith('.sql')) continue;

      const fullPath = path.join(this.storageDir, filename);
      try {
        const stat = fs.statSync(fullPath);
        const sizeBytes = stat.size;
        const sizeMb = parseFloat((sizeBytes / (1024 * 1024)).toFixed(2));

        let type: BackupType = 'MANUAL';
        if (filename.startsWith('backup-auto')) type = 'AUTOMATIC';
        else if (filename.startsWith('backup-shift-close')) type = 'SHIFT_CLOSE';
        else if (filename.startsWith('safety-snapshot'))
          type = 'SAFETY_SNAPSHOT';

        backupList.push({
          filename,
          sizeBytes,
          sizeMb,
          createdAt: stat.mtime,
          type,
          location: 'LOCAL',
        });
      } catch (err) {
        this.logger.warn(`No se pudo leer metadatos de ${filename}: ${err}`);
      }
    }

    // Ordenar de más reciente a más antiguo
    return backupList.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  /**
   * Obtiene la ruta física segura de un archivo de respaldo.
   */
  getBackupFilePath(filename: string): string {
    const sanitized = path.basename(filename);
    const fullPath = path.join(this.storageDir, sanitized);
    if (!fs.existsSync(fullPath)) {
      throw new NotFoundException(`El archivo de respaldo ${filename} no existe`);
    }
    return fullPath;
  }

  /**
   * Elimina un archivo de respaldo del almacenamiento local.
   */
  async deleteBackup(filename: string): Promise<void> {
    const filePath = this.getBackupFilePath(filename);
    try {
      fs.unlinkSync(filePath);
      this.logger.log(`Archivo de respaldo eliminado: ${filename}`);
      try {
        await this.cloudProvider.delete(filename);
      } catch {
        // ignore
      }
    } catch (err: any) {
      this.logger.error(`Error al eliminar archivo ${filename}: ${err?.message}`);
      throw new InternalServerErrorException(
        `No se pudo eliminar el archivo de respaldo: ${err?.message}`,
      );
    }
  }

  /**
   * Restaura la base de datos con un archivo dado (existente o temporal subido).
   * Genera de forma obligatoria y previa un Snapshot de Seguridad preventivo.
   */
  async restoreBackup(options: {
    filename?: string;
    tempFilePath?: string;
  }): Promise<RestoreBackupResponseDto> {
    let sourcePath: string;
    let sourceName: string;

    if (options.tempFilePath) {
      sourcePath = options.tempFilePath;
      sourceName = path.basename(options.tempFilePath);
    } else if (options.filename) {
      sourcePath = this.getBackupFilePath(options.filename);
      sourceName = path.basename(options.filename);
    } else {
      throw new BadRequestException('Debes indicar un archivo para restaurar');
    }

    if (!fs.existsSync(sourcePath)) {
      throw new NotFoundException('El archivo de respaldo a restaurar no existe');
    }

    // 1. Crear Snapshot de Seguridad preventivo obligatorio
    this.logger.warn(
      `Iniciando proceso de restauración desde [${sourceName}]. Generando snapshot preventivo...`,
    );
    const safetySnapshot = await this.generateBackup('SAFETY_SNAPSHOT');
    this.logger.log(
      `Snapshot de seguridad preventivo creado: ${safetySnapshot.filename}`,
    );

    // 2. Ejecutar restauración con psql
    const creds = this.getDatabaseCredentials();
    const psqlPath = this.resolveBinaryPath('psql');

    const args = [
      '-h',
      creds.host,
      '-p',
      creds.port,
      '-U',
      creds.username,
      '-d',
      creds.database,
      '-f',
      sourcePath,
    ];

    try {
      await execFileAsync(psqlPath, args, {
        env: {
          ...process.env,
          PGPASSWORD: creds.password,
        },
      });

      this.logger.log(
        `Base de datos restaurada exitosamente desde ${sourceName}`,
      );

      // Si provino de un archivo subido temporalmente, conservarlo en el almacenamiento local
      if (options.tempFilePath) {
        const storedImportedName = `backup-imported_${new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '')}.sql`;
        const storedImportedPath = path.join(
          this.storageDir,
          storedImportedName,
        );
        try {
          fs.copyFileSync(sourcePath, storedImportedPath);
        } catch {
          // ignore
        }
      }

      return {
        success: true,
        safetySnapshot: safetySnapshot.filename,
        restoredFrom: sourceName,
        message:
          'Base de datos restaurada correctamente. Se generó un snapshot de seguridad preventivo antes de aplicar los cambios.',
      };
    } catch (err: any) {
      this.logger.error(`Fallo crítico al restaurar con psql: ${err?.message || err}`);
      throw new InternalServerErrorException(
        `Error al restaurar la base de datos: ${err?.message || 'Error ejecutando psql'}. Tu estado previo quedó respaldado en: ${safetySnapshot.filename}`,
      );
    }
  }

  /**
   * Depuración de respaldos antiguos según los días de retención configurados.
   */
  async cleanExpiredBackups(): Promise<number> {
    const config = await this.getConfig();
    const retentionDays = config.retentionDays || 30;
    const now = Date.now();
    const cutoffTime = now - retentionDays * 24 * 60 * 60 * 1000;

    let deletedCount = 0;
    const files = fs.readdirSync(this.storageDir);

    for (const file of files) {
      if (!file.endsWith('.sql')) continue;
      const fullPath = path.join(this.storageDir, file);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.mtimeMs < cutoffTime) {
          fs.unlinkSync(fullPath);
          deletedCount++;
          this.logger.log(
            `Depurado respaldo vencido por política de retención (${retentionDays} días): ${file}`,
          );
        }
      } catch (err) {
        this.logger.warn(`No se pudo verificar retención para ${file}: ${err}`);
      }
    }

    return deletedCount;
  }

  /**
   * Tarea programada: evalúa cada minuto si corresponde ejecutar el respaldo nocturno.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async handleScheduledCron() {
    try {
      const config = await this.getConfig();
      if (!config.enabled) return;

      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();

      if (currentHour === config.hour && currentMinute === config.minute) {
        const dateKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}_${currentHour}:${currentMinute}`;
        if (this.lastCronExecutionKey === dateKey) {
          return; // Ya ejecutado en este minuto
        }
        this.lastCronExecutionKey = dateKey;

        this.logger.log(
          `Disparando respaldo programado diario (${config.hour}:${String(config.minute).padStart(2, '0')})...`,
        );
        await this.generateBackup('AUTOMATIC');
      }
    } catch (err) {
      this.logger.error(`Error en verificación de cron de respaldos: ${err}`);
    }
  }

  /**
   * Hook desacoplado de evento: Respaldo automático al cierre de caja.
   */
  @OnEvent('shift.closed')
  async handleShiftClosedEvent(payload: {
    shiftId: string;
    closeType?: string;
  }) {
    try {
      const config = await this.getConfig();
      if (!config.backupOnShiftClose) return;

      this.logger.log(
        `Turno cerrado detectado (ID: ${payload.shiftId}, Tipo: ${payload.closeType || 'Desconocido'}). Disparando respaldo automático...`,
      );
      await this.generateBackup('SHIFT_CLOSE');
    } catch (err) {
      this.logger.error(
        `Error al generar respaldo automático por cierre de caja: ${err}`,
      );
    }
  }
}
