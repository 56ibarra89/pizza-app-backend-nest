import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BackupsService } from './backups.service';

jest.mock('child_process', () => ({
  execFile: jest.fn(),
}));

describe('BackupsService restore safeguards (H03)', () => {
  const execFileMock = childProcess.execFile as unknown as jest.Mock;
  let tempDir: string;
  let validSqlFile: string;
  let emptySqlFile: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pizza-backup-test-'));
    validSqlFile = path.join(tempDir, 'restore-source.sql');
    emptySqlFile = path.join(tempDir, 'empty.sql');
    fs.writeFileSync(validSqlFile, '-- PostgreSQL database dump\nSELECT 1;\n');
    fs.writeFileSync(emptySqlFile, '');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    execFileMock.mockReset();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  function createService(stubHelpers = true) {
    const configService = {
      get: jest
        .fn()
        .mockReturnValue(
          'postgresql://postgres:secret@localhost:5432/pizza_app',
        ),
    };
    const appConfigService = {
      getByIdOrDefault: jest.fn().mockResolvedValue({ data: {} }),
    };
    const cloudProvider = {
      upload: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const systemLogs = {
      createProcess: jest.fn().mockResolvedValue(undefined),
    };

    const service = new BackupsService(
      configService as never,
      appConfigService as never,
      cloudProvider as never,
      systemLogs as never,
    );

    if (stubHelpers) {
      jest.spyOn(service, 'generateBackup').mockResolvedValue({
        filename: 'safety-snapshot_2026-11-04_09-00-00.sql',
        sizeBytes: 1024,
        sizeMb: 0.01,
        createdAt: new Date('2026-11-04T15:00:00.000Z'),
        type: 'SAFETY_SNAPSHOT',
        location: 'LOCAL',
      });
      jest
        .spyOn(service, 'getBackupFilePath')
        .mockImplementation((name) =>
          name === 'empty.sql' ? emptySqlFile : validSqlFile,
        );
    }

    return service;
  }

  it('invokes psql with ON_ERROR_STOP=1 and --single-transaction and verifies core tables', async () => {
    const service = createService();
    const calls: Array<{ file: string; args: string[] }> = [];

    execFileMock.mockImplementation(
      (
        file: string,
        args: string[],
        _options: unknown,
        callback: (
          err: Error | null,
          result: { stdout: string; stderr: string },
        ) => void,
      ) => {
        calls.push({ file, args });
        if (args.includes('-f')) {
          callback(null, { stdout: 'BEGIN\nCOMMIT\n', stderr: '' });
          return;
        }
        callback(null, { stdout: '9\n', stderr: '' });
      },
    );

    const response = await service.restoreBackup({
      filename: 'restore-source.sql',
    });

    expect(response.success).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls[0].args).toEqual(
      expect.arrayContaining(['-v', 'ON_ERROR_STOP=1', '--single-transaction']),
    );
    expect(calls[1].args).toEqual(
      expect.arrayContaining(['-v', 'ON_ERROR_STOP=1', '-t', '-A', '-c']),
    );
  });

  it('fails the restore when post-restore integrity verification reports missing core tables', async () => {
    const service = createService();

    execFileMock.mockImplementation(
      (
        _file: string,
        args: string[],
        _options: unknown,
        callback: (
          err: Error | null,
          result: { stdout: string; stderr: string },
        ) => void,
      ) => {
        if (args.includes('-f')) {
          callback(null, { stdout: 'DROP TABLE\n', stderr: '' });
          return;
        }
        callback(null, { stdout: '4\n', stderr: '' });
      },
    );

    await expect(
      service.restoreBackup({ filename: 'restore-source.sql' }),
    ).rejects.toThrow(InternalServerErrorException);
  });

  it('fails the restore when psql reports an ERROR in stderr even with exit code 0', async () => {
    const service = createService();

    execFileMock.mockImplementation(
      (
        _file: string,
        _args: string[],
        _options: unknown,
        callback: (
          err: Error | null,
          result: { stdout: string; stderr: string },
        ) => void,
      ) => {
        callback(null, {
          stdout: '',
          stderr: 'psql:restore-source.sql:42: ERROR: relation does not exist',
        });
      },
    );

    await expect(
      service.restoreBackup({ filename: 'restore-source.sql' }),
    ).rejects.toThrow(InternalServerErrorException);
  });

  it('rejects empty history backup files before running psql', async () => {
    const service = createService();

    await expect(
      service.restoreBackup({ filename: 'empty.sql' }),
    ).rejects.toThrow(BadRequestException);
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it('prevents concurrent restore operations', async () => {
    const service = createService();
    let releaseRestore!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseRestore = resolve;
    });

    execFileMock.mockImplementation(
      (
        _file: string,
        args: string[],
        _options: unknown,
        callback: (
          err: Error | null,
          result: { stdout: string; stderr: string },
        ) => void,
      ) => {
        if (args.includes('-f')) {
          void gate.then(() => callback(null, { stdout: 'OK', stderr: '' }));
          return;
        }
        callback(null, { stdout: '9\n', stderr: '' });
      },
    );

    const firstRestore = service.restoreBackup({
      filename: 'restore-source.sql',
    });

    await expect(
      service.restoreBackup({ filename: 'restore-source.sql' }),
    ).rejects.toThrow(ConflictException);

    releaseRestore();
    await expect(firstRestore).resolves.toMatchObject({ success: true });
  });

  it('rechaza path traversal o extensiones inválidas en getBackupFilePath', () => {
    const service = createService(false);

    expect(() => service.getBackupFilePath('../escape.sql')).toThrow(
      BadRequestException,
    );
    expect(() => service.getBackupFilePath('nested/file.sql')).toThrow(
      BadRequestException,
    );
    expect(() => service.getBackupFilePath('notes.txt')).toThrow(
      BadRequestException,
    );
  });

  it('serializa llamadas concurrentes a generateBackup para evitar colisiones', async () => {
    const service = createService(false);
    Object.assign(service as unknown as { storageDir: string }, {
      storageDir: tempDir,
    });
    jest.spyOn(service, 'resolveBinaryPath').mockReturnValue('pg_dump');
    jest.spyOn(service, 'cleanExpiredBackups').mockResolvedValue(0);
    let activeCount = 0;
    let maxConcurrent = 0;

    execFileMock.mockImplementation(
      (
        _file: string,
        args: string[],
        _options: unknown,
        callback: (
          err: Error | null,
          result?: { stdout: string; stderr: string },
        ) => void,
      ) => {
        activeCount += 1;
        maxConcurrent = Math.max(maxConcurrent, activeCount);
        const destPath = args[args.length - 1];
        fs.writeFileSync(destPath, '-- sql dump');
        setTimeout(() => {
          activeCount -= 1;
          callback(null, { stdout: '', stderr: '' });
        }, 15);
      },
    );

    const [first, second] = await Promise.all([
      service.generateBackup('MANUAL'),
      service.generateBackup('MANUAL'),
    ]);

    expect(maxConcurrent).toBe(1);
    expect(first.filename).not.toBe(second.filename);
  });

  it('pasa -q y maxBuffer ampliado a psql en restoreBackup', async () => {
    const service = createService();
    let restoreOptions: Record<string, unknown> | undefined;
    let restoreArgs: string[] = [];

    execFileMock.mockImplementation(
      (
        _file: string,
        args: string[],
        options: Record<string, unknown>,
        callback: (
          err: Error | null,
          result?: { stdout: string; stderr: string },
        ) => void,
      ) => {
        if (args.includes('-f')) {
          restoreArgs = args;
          restoreOptions = options;
        }
        callback(null, { stdout: '9\n', stderr: '' });
      },
    );

    await service.restoreBackup({ filename: 'restore-source.sql' });

    expect(restoreArgs).toContain('-q');
    expect(restoreOptions?.maxBuffer).toBe(64 * 1024 * 1024);
  });
});
