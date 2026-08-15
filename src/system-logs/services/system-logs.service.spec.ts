import { LogLevel } from '@prisma/client';
import { UserRoleDto } from '../../users/dto/user-role.dto';
import type { ISystemLogsRepository } from '../interfaces/system-logs.repository';
import { SystemLogsService } from './system-logs.service';

describe('SystemLogsService', () => {
  const create = jest.fn();
  const repo: jest.Mocked<ISystemLogsRepository> = {
    create,
    findMany: jest.fn(),
  };
  const service = new SystemLogsService(repo);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registra como autor al usuario autenticado y no al enviado por el cliente', async () => {
    create.mockResolvedValue({
      id: 1,
      timestamp: new Date(),
      userId: 'cook-id',
      user: 'bianka',
      role: UserRoleDto.cocinero,
      action: 'LOGIN_PIN',
      level: LogLevel.INFO,
    });

    await service.create(
      {
        user: 'usuario-falso',
        role: UserRoleDto.admin,
        action: 'LOGIN_PIN',
        details: 'Inicio de sesión con PIN',
        level: LogLevel.INFO,
      },
      {
        id: 'cook-id',
        username: 'bianka',
        role: UserRoleDto.cocinero,
      },
    );

    expect(create).toHaveBeenCalledWith({
      userId: 'cook-id',
      user: 'bianka',
      role: UserRoleDto.cocinero,
      action: 'LOGIN_PIN',
      details: 'Inicio de sesión con PIN',
      level: LogLevel.INFO,
    });
  });
});
