import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';
import { randomUUID } from 'node:crypto';
import * as os from 'node:os';
import * as path from 'node:path';
import { diskStorage } from 'multer';

export const MAX_BACKUP_UPLOAD_BYTES = 100 * 1024 * 1024;
export const MAX_BACKUP_UPLOAD_MB = MAX_BACKUP_UPLOAD_BYTES / (1024 * 1024);

export function isSqlBackupFilename(filename: unknown): filename is string {
  return (
    typeof filename === 'string' &&
    filename.length > 4 &&
    path.extname(filename).toLowerCase() === '.sql'
  );
}

export const backupUploadOptions = {
  storage: diskStorage({
    destination: os.tmpdir(),
    filename: (
      _request: Request,
      _file: Express.Multer.File,
      callback: (error: Error | null, filename: string) => void,
    ) => callback(null, `pizza-backup-upload-${randomUUID()}.sql`),
  }),
  limits: {
    fileSize: MAX_BACKUP_UPLOAD_BYTES,
    files: 1,
    fields: 0,
    parts: 1,
    fieldNameSize: 64,
    fieldSize: 1024,
  },
  fileFilter: (
    _request: Request,
    file: Express.Multer.File,
    callback: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    if (!isSqlBackupFilename(file.originalname)) {
      callback(
        new BadRequestException('El archivo subido debe tener extensión .sql'),
        false,
      );
      return;
    }
    callback(null, true);
  },
};
