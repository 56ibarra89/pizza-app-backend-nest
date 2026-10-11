import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { UserRoleDto } from '../../users/dto/user-role.dto';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  const getAllAndOverride = jest.fn();
  const guard = new RolesGuard({ getAllAndOverride } as unknown as Reflector);

  const contextFor = (role?: UserRoleDto, permissions: string[] = []) =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user: role ? { role, permissions } : undefined }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => jest.clearAllMocks());

  it('deniega al motorizado los endpoints sin permiso explícito', () => {
    getAllAndOverride.mockImplementation((key: string) =>
      key === 'roles' ? [UserRoleDto.admin] : undefined,
    );

    expect(() => guard.canActivate(contextFor(UserRoleDto.motorizado))).toThrow(
      ForbiddenException,
    );
  });

  it('permite al motorizado un endpoint que declara su rol', () => {
    getAllAndOverride.mockImplementation((key: string) =>
      key === 'roles' ? [UserRoleDto.motorizado] : undefined,
    );

    expect(guard.canActivate(contextFor(UserRoleDto.motorizado))).toBe(true);
  });

  it('mantiene el comportamiento de los endpoints públicos', () => {
    getAllAndOverride.mockReturnValue(undefined);

    expect(guard.canActivate(contextFor())).toBe(true);
  });

  it('deniega aunque tenga el permiso cuando no cumple el rol requerido', () => {
    getAllAndOverride.mockImplementation((key: string) =>
      key === 'permissions' ? ['reports.read'] : [UserRoleDto.admin],
    );

    expect(() =>
      guard.canActivate(contextFor(UserRoleDto.cajero, ['reports.read'])),
    ).toThrow(ForbiddenException);
  });

  it('autoriza cuando cumple tanto el permiso como el rol requerido', () => {
    getAllAndOverride.mockImplementation((key: string) =>
      key === 'permissions' ? ['reports.read'] : [UserRoleDto.admin],
    );

    expect(
      guard.canActivate(contextFor(UserRoleDto.admin, ['reports.read'])),
    ).toBe(true);
  });

  it('deniega aunque cumpla el rol cuando falta el permiso requerido', () => {
    getAllAndOverride.mockImplementation((key: string) =>
      key === 'permissions' ? ['reports.read'] : [UserRoleDto.admin],
    );

    expect(() =>
      guard.canActivate(contextFor(UserRoleDto.admin, ['reports.export'])),
    ).toThrow(ForbiddenException);
  });

  it('autoriza un endpoint que exige únicamente permisos', () => {
    getAllAndOverride.mockImplementation((key: string) =>
      key === 'permissions' ? ['reports.read'] : undefined,
    );

    expect(
      guard.canActivate(contextFor(UserRoleDto.cajero, ['reports.read'])),
    ).toBe(true);
  });

  it('deniega cuando falta un permiso requerido', () => {
    getAllAndOverride.mockImplementation((key: string) =>
      key === 'permissions' ? ['roles.manage'] : undefined,
    );

    expect(() =>
      guard.canActivate(contextFor(UserRoleDto.cajero, ['roles.read'])),
    ).toThrow(ForbiddenException);
  });
});
