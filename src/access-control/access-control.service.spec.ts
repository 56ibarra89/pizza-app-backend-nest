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

  it('rechaza permisos exclusivos de administrador al crear o actualizar roles con baseRole no admin', async () => {
    const prismaMock = {
      permission: {
        findMany: jest.fn(({ where }) =>
          Promise.resolve(
            (where?.code?.in ?? ['products.manage']).map(
              (code: string, idx: number) => ({ id: `perm-${idx}`, code }),
            ),
          ),
        ),
        count: jest.fn(({ where }) =>
          Promise.resolve(where?.code?.in?.length ?? 1),
        ),
      },
      accessRole: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn(({ where }) =>
          Promise.resolve(
            where?.id === 'role-custom-1'
              ? {
                  id: 'role-custom-1',
                  code: 'CUSTOM_CAJERO',
                  name: 'Cajero Especial',
                  description: null,
                  baseRole: 'cajero',
                  isSystem: false,
                  isActive: true,
                  permissions: [],
                  _count: { users: 0 },
                }
              : where?.id === 'role-created'
                ? {
                    id: 'role-created',
                    code: 'ADMIN_PRODUCTOS',
                    name: 'Admin Productos',
                    description: 'Permitido para baseRole admin',
                    baseRole: 'admin',
                    isSystem: false,
                    isActive: true,
                    permissions: [
                      { permission: { id: 'perm-0', code: 'products.manage' } },
                    ],
                    _count: { users: 0 },
                  }
                : null,
          ),
        ),
        create: jest.fn().mockImplementation(async ({ data }) => ({
          id: 'role-created',
          code: data.code,
          name: data.name,
          description: data.description,
          baseRole: data.baseRole,
          isSystem: false,
          isActive: true,
          permissions: [],
          _count: { users: 0 },
        })),
        update: jest.fn(),
      },
      rolePermission: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      systemLog: {
        create: jest.fn().mockResolvedValue({ id: 'log-1' }),
      },
      $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
        cb(prismaMock),
      ),
    };

    const service = new AccessControlService(prismaMock as never);
    const adminActor = {
      id: 'admin-1',
      username: 'admin',
      role: 'admin' as never,
    };

    await expect(
      service.create(
        {
          name: 'Cajero Productos',
          description: 'No permitido',
          baseRole: 'cajero' as never,
          permissionCodes: ['products.manage'],
        },
        adminActor,
      ),
    ).rejects.toThrow(/Administrador/i);
    expect(prismaMock.accessRole.create).not.toHaveBeenCalled();

    await expect(
      service.update(
        'role-custom-1',
        {
          permissionCodes: ['products.manage'],
        },
        adminActor,
      ),
    ).rejects.toThrow(/Administrador/i);

    await expect(
      service.create(
        {
          name: 'Admin Productos',
          description: 'Permitido para baseRole admin',
          baseRole: 'admin' as never,
          permissionCodes: ['products.manage'],
        },
        adminActor,
      ),
    ).resolves.toMatchObject({
      baseRole: 'admin',
    });
  });

  it('B61, B62, F73, F74, F75 — revoca sesiones al desactivar rol, protege al último admin del sistema y expande dependencias de lectura', async () => {
    const prismaMock = {
      accessRole: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'role-custom-1',
          code: 'cajero-noches',
          name: 'Cajero Noches',
          description: 'Rol personalizado',
          baseRole: 'CAJERO',
          isSystem: false,
          isActive: true,
          permissions: [],
          _count: { users: 0 },
        }),
        update: jest.fn().mockImplementation(async ({ data }) => ({
          id: 'role-custom-1',
          code: 'cajero-noches',
          name: 'Cajero Noches',
          description: 'Rol personalizado',
          baseRole: 'CAJERO',
          isSystem: false,
          isActive: data.isActive ?? true,
          permissions: [],
          _count: { users: 0 },
        })),
      },
      user: {
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
        findUnique: jest.fn().mockImplementation(async ({ where }) => {
          if (where.id === 'user-inactive-role') {
            return {
              id: 'user-inactive-role',
              role: 'CAJERO',
              accessRole: {
                id: 'role-custom-1',
                code: 'cajero-noches',
                name: 'Cajero Noches',
                isActive: false,
                permissions: [{ permission: { code: 'orders.read' } }],
              },
            };
          }
          if (where.id === 'user-legacy-role') {
            return {
              id: 'user-legacy-role',
              role: 'DESPACHADOR',
              accessRole: null,
            };
          }
          return {
            id: 'admin-1',
            username: 'admin',
            role: 'ADMIN',
            isActive: true,
            accessRoleId: null,
          };
        }),
        count: jest
          .fn()
          .mockImplementation(
            async ({ where }: { where?: { accessRoleId?: string } }) =>
              where?.accessRoleId ? 0 : 1,
          ),
      },
      systemLog: {
        create: jest.fn().mockResolvedValue({ id: 'log-1' }),
      },
      $queryRaw: jest
        .fn()
        .mockResolvedValue([{ isActive: true, pg_advisory_xact_lock: '' }]),
      $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
        cb(prismaMock),
      ),
    };

    const service = new AccessControlService(prismaMock as never);
    const adminActor = {
      id: 'admin-1',
      username: 'admin',
      role: 'admin' as never,
    };

    await service.update('role-custom-1', { isActive: false }, adminActor);
    expect(prismaMock.user.updateMany).toHaveBeenCalledWith({
      where: { accessRoleId: 'role-custom-1' },
      data: { tokenVersion: { increment: 1 } },
    });

    await expect(
      service.assignRoleToUser('admin-1', 'role-custom-1', adminActor),
    ).rejects.toThrow(/último administrador activo/i);

    const inactiveAuth =
      await service.authorizationForUser('user-inactive-role');
    expect(inactiveAuth.permissions).toEqual([]);

    const legacyAuth = await service.authorizationForUser('user-legacy-role');
    expect(legacyAuth.permissions).toContain('cash.expenses');
  });
});
