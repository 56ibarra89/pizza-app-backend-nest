import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { UserRoleDto } from '../../users/dto/user-role.dto';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  const getAllAndOverride = jest.fn();
  const guard = new RolesGuard({ getAllAndOverride } as unknown as Reflector);

  const contextFor = (role?: UserRoleDto) =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user: role ? { role } : undefined }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => jest.clearAllMocks());

  it('deniega al motorizado los endpoints sin permiso explícito', () => {
    getAllAndOverride.mockReturnValue(undefined);

    expect(() => guard.canActivate(contextFor(UserRoleDto.motorizado))).toThrow(
      ForbiddenException,
    );
  });

  it('permite al motorizado un endpoint que declara su rol', () => {
    getAllAndOverride.mockReturnValue([UserRoleDto.motorizado]);

    expect(guard.canActivate(contextFor(UserRoleDto.motorizado))).toBe(true);
  });

  it('mantiene el comportamiento de los endpoints públicos', () => {
    getAllAndOverride.mockReturnValue(undefined);

    expect(guard.canActivate(contextFor())).toBe(true);
  });
});
