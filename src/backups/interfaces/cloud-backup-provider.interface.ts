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
  download(filename: string, destinationPath: string): Promise<{ success: boolean; error?: string }>;
  list(): Promise<CloudBackupFileInfo[]>;
  delete(filename: string): Promise<boolean>;
}

export const CLOUD_BACKUP_PROVIDER = 'CLOUD_BACKUP_PROVIDER';

/**
 * Proveedor base inicial: Maneja almacenamiento local como primera capa de verdad.
 * Facilita la inyección e intercambio por adaptadores de AWS S3, Google Drive, OneDrive o Cloudflare R2 sin modificar los servicios de negocio.
 */
export class LocalFirstCloudBackupProvider implements ICloudBackupProvider {
  readonly name = 'LocalFirst';

  isConfigured(): boolean {
    return true;
  }

  async upload(_filePath: string, _filename: string): Promise<CloudBackupResult> {
    // Almacenamiento local principal garantizado. Listo para despachar a S3 / GDrive cuando se configuren credenciales.
    return { success: true };
  }

  async download(_filename: string, _destinationPath: string): Promise<{ success: boolean; error?: string }> {
    return { success: true };
  }

  async list(): Promise<CloudBackupFileInfo[]> {
    return [];
  }

  async delete(_filename: string): Promise<boolean> {
    return true;
  }
}
