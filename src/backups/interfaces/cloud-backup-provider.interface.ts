import * as fs from 'fs';
import * as path from 'path';

export interface CloudBackupResult {
  success: boolean;
  cloudUrl?: string;
  error?: string;
}

export interface CloudBackupFileInfo {
  filename: string;
  sizeBytes: number;
  updatedAt: Date;
}

export interface ICloudBackupProvider {
  readonly name: string;
  isConfigured(): boolean;
  upload(filePath: string, filename: string): Promise<CloudBackupResult>;
  download(
    filename: string,
    destinationPath: string,
  ): Promise<{ success: boolean; error?: string }>;
  list(): Promise<CloudBackupFileInfo[]>;
  delete(filename: string): Promise<boolean>;
}

export const CLOUD_BACKUP_PROVIDER = 'CLOUD_BACKUP_PROVIDER';

/**
 * Proveedor base inicial: Replica respaldos hacia un directorio externo o volumen
 * duradero configurado mediante BACKUP_EXTERNAL_DIR. Si no existe un destino externo
 * configurado, reporta explícitamente que no está configurado para no simular una
 * carga externa exitosa en entornos con disco efímero (ej. dynos o contenedores sin volumen).
 */
export class LocalFirstCloudBackupProvider implements ICloudBackupProvider {
  readonly name = 'LocalFirst';

  private getExternalDir(): string | null {
    const configured = process.env.BACKUP_EXTERNAL_DIR?.trim();
    return configured && configured.length > 0
      ? path.resolve(configured)
      : null;
  }

  isConfigured(): boolean {
    return this.getExternalDir() !== null;
  }

  async upload(filePath: string, filename: string): Promise<CloudBackupResult> {
    const externalDir = this.getExternalDir();
    if (!externalDir) {
      return {
        success: false,
        error:
          'Almacenamiento externo duradero no configurado (BACKUP_EXTERNAL_DIR). La copia sólo reside en el disco local.',
      };
    }

    try {
      await fs.promises.mkdir(externalDir, { recursive: true });
      const sanitizedName = path.basename(filename);
      const targetPath = path.join(externalDir, sanitizedName);
      await fs.promises.copyFile(filePath, targetPath);
      return {
        success: true,
        cloudUrl: targetPath,
      };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async download(
    filename: string,
    destinationPath: string,
  ): Promise<{ success: boolean; error?: string }> {
    const externalDir = this.getExternalDir();
    if (!externalDir) {
      return {
        success: false,
        error:
          'Almacenamiento externo duradero no configurado (BACKUP_EXTERNAL_DIR).',
      };
    }
    try {
      const sourcePath = path.join(externalDir, path.basename(filename));
      await fs.promises.copyFile(sourcePath, destinationPath);
      return { success: true };
    } catch (error: unknown) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async list(): Promise<CloudBackupFileInfo[]> {
    const externalDir = this.getExternalDir();
    if (!externalDir || !fs.existsSync(externalDir)) {
      return [];
    }
    const entries = await fs.promises.readdir(externalDir);
    const items: CloudBackupFileInfo[] = [];
    for (const entry of entries) {
      if (!entry.endsWith('.sql')) continue;
      try {
        const stat = await fs.promises.stat(path.join(externalDir, entry));
        if (stat.isFile()) {
          items.push({
            filename: entry,
            sizeBytes: stat.size,
            updatedAt: stat.mtime,
          });
        }
      } catch {
        // ignore unreadable entries
      }
    }
    return items;
  }

  async delete(filename: string): Promise<boolean> {
    const externalDir = this.getExternalDir();
    if (!externalDir) return false;
    try {
      const targetPath = path.join(externalDir, path.basename(filename));
      if (fs.existsSync(targetPath)) {
        await fs.promises.unlink(targetPath);
      }
      return true;
    } catch {
      return false;
    }
  }
}
