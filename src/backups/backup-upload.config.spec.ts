import { BadRequestException } from '@nestjs/common';
import {
  backupUploadOptions,
  isSqlBackupFilename,
  MAX_BACKUP_UPLOAD_BYTES,
} from './backup-upload.config';

describe('backup upload security configuration', () => {
  it('limits each request to one 100 MB file', () => {
    expect(backupUploadOptions.limits).toEqual({
      fileSize: 100 * 1024 * 1024,
      files: 1,
      fields: 0,
      parts: 1,
      fieldNameSize: 64,
      fieldSize: 1024,
    });
    expect(MAX_BACKUP_UPLOAD_BYTES).toBe(104_857_600);
  });

  it.each([
    ['backup.sql', true],
    ['BACKUP.SQL', true],
    ['backup.sql.exe', false],
    ['backup.zip', false],
    ['', false],
  ])('validates the SQL extension for %s', (filename, expected) => {
    expect(isSqlBackupFilename(filename)).toBe(expected);
  });

  it('rejects non-SQL files before writing them', () => {
    let receivedError: Error | null = null;
    let accepted = true;
    const callback = (error: Error | null, acceptFile: boolean) => {
      receivedError = error;
      accepted = acceptFile;
    };

    backupUploadOptions.fileFilter(
      {} as never,
      { originalname: 'payload.exe' } as Express.Multer.File,
      callback,
    );

    expect(receivedError).toBeInstanceOf(BadRequestException);
    expect(accepted).toBe(false);
  });

  it('accepts SQL files', () => {
    const callback = jest.fn();

    backupUploadOptions.fileFilter(
      {} as never,
      { originalname: 'backup.sql' } as Express.Multer.File,
      callback,
    );

    expect(callback).toHaveBeenCalledWith(null, true);
  });
});
