import { UserRoleDto } from '../common';
import { AccessControlService } from './access-control.service';
import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSION_CATALOG,
} from './permission-catalog';

describe('AccessControlService', () => {
  it('incluye devices.read y tables.operate en roles operativos por defecto y ejecuta backfill idempotente v2', async () => {
    expect(DEFAULT_ROLE_PERMISSIONS[UserRoleDto.cajero]).toEqual(
      expect.arrayContaining(['devices.read', 'tables.operate']),
    );
    expect(DEFAULT_ROLE_PERMISSIONS[UserRoleDto.cajero_principal]).toEqual(
      expect.arrayContaining(['devices.read', 'tables.operate']),
    );
    expect(DEFAULT_ROLE_PERMISSIONS[UserRoleDto.mesero]).toContain(
      'devices.read',
    );
    expect(DEFAULT_ROLE_PERMISSIONS[UserRoleDto.cocinero]).toContain(
      'devices.read',
    );
    expect(DEFAULT_ROLE_PERMISSIONS[UserRoleDto.despachador]).toEqual(
      expect.arrayContaining(['devices.read', 'tables.operate']),
    );

    const permissionRows = PERMISSION_CATALOG.map((item, idx) => ({
      id: `perm-${idx + 1}`,
      code: item.code,
    }));
    const permissionByCode = new Map(
      permissionRows.map((item) => [item.code, item.id]),
    );

    const rolePermissionCreateMany = jest.fn().mockResolvedValue({ count: 0 });
    const appConfigUpsert = jest.fn().mockResolvedValue({ id: 'ok' });

    const tx = {
      permission: {
        upsert: jest.fn().mockResolvedValue(undefined),
        findMany: jest.fn().mockResolvedValue(permissionRows),
      },
      accessRole: {
        upsert: jest
          .fn()
          .mockImplementation(({ where }: { where: { code: string } }) => ({
            id: `role-${where.code}`,
            code: where.code,
          })),
      },
      rolePermission: {
        count: jest
          .fn()
          .mockImplementation(({ where }: { where: { roleId: string } }) =>
            where.roleId === 'role-admin' ? 0 : 10,
          ),
        createMany: rolePermissionCreateMany,
      },
      user: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      appConfig: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: appConfigUpsert,
      },
    };

    const prisma = {
      $transaction: jest.fn((cb: (client: typeof tx) => unknown) => cb(tx)),
    };

    const service = new AccessControlService(prisma as any);
    await service.ensureSystemConfiguration();

    expect(appConfigUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'access_control_baseline_v2' },
      }),
    );

    expect(rolePermissionCreateMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        {
          roleId: 'role-cajero',
          permissionId: permissionByCode.get('devices.read'),
        },
        {
          roleId: 'role-cajero',
          permissionId: permissionByCode.get('tables.operate'),
        },
        {
          roleId: 'role-cocinero',
          permissionId: permissionByCode.get('devices.read'),
        },
        {
          roleId: 'role-despachador',
          permissionId: permissionByCode.get('tables.operate'),
        },
      ]),
      skipDuplicates: true,
    });
  });
});
