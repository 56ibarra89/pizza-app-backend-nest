import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { LogLevel, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import type { CreateAccessRoleDto } from './dto/create-access-role.dto';
import type { UpdateAccessRoleDto } from './dto/update-access-role.dto';
import {
  ADMIN_ONLY_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSION_CATALOG,
  SYSTEM_ROLE_NAMES,
} from './permission-catalog';
import { fromDbRole, toDbRole } from '../users/mappers/user-role.mapper';
import { SECURITY_SOCKETS_REVALIDATE_EVENT, UserRoleDto } from '../common';

const ACCESS_CONTROL_BASELINE_V2_KEY = 'access_control_baseline_v2';
const BASELINE_V2_ROLE_BACKFILL: Partial<
  Record<UserRoleDto, readonly string[]>
> = {
  [UserRoleDto.cajero]: ['devices.read', 'tables.operate'],
  [UserRoleDto.cajero_principal]: ['devices.read', 'tables.operate'],
  [UserRoleDto.mesero]: ['devices.read'],
  [UserRoleDto.cocinero]: ['devices.read'],
  [UserRoleDto.despachador]: ['devices.read', 'tables.operate'],
};

@Injectable()
export class AccessControlService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly eventEmitter?: EventEmitter2,
  ) {}

  async onModuleInit() {
    await this.ensureSystemConfiguration();
  }

  async ensureSystemConfiguration() {
    await this.prisma.$transaction(async (tx) => {
      for (const definition of PERMISSION_CATALOG) {
        await tx.permission.upsert({
          where: { code: definition.code },
          create: definition,
          update: {
            module: definition.module,
            action: definition.action,
            description: definition.description,
          },
        });
      }

      const permissions = await tx.permission.findMany();
      const permissionByCode = new Map(
        permissions.map((item) => [item.code, item.id]),
      );

      const roleIdByCode = new Map<UserRoleDto, string>();

      for (const role of Object.values(UserRoleDto)) {
        const accessRole = await tx.accessRole.upsert({
          where: { code: role },
          create: {
            code: role,
            name: SYSTEM_ROLE_NAMES[role],
            description: `Rol del sistema para ${SYSTEM_ROLE_NAMES[role]}`,
            baseRole: toDbRole(role),
            isSystem: true,
          },
          update: { isSystem: true },
        });
        roleIdByCode.set(role, accessRole.id);

        const configuredCount = await tx.rolePermission.count({
          where: { roleId: accessRole.id },
        });
        if (configuredCount === 0 || role === UserRoleDto.admin) {
          await tx.rolePermission.createMany({
            data: DEFAULT_ROLE_PERMISSIONS[role].map((code) => ({
              roleId: accessRole.id,
              permissionId: permissionByCode.get(code)!,
            })),
            skipDuplicates: true,
          });
        }

        await tx.user.updateMany({
          where: { role: toDbRole(role), accessRoleId: null },
          data: { accessRoleId: accessRole.id },
        });
      }

      if (
        typeof tx.appConfig?.findUnique === 'function' &&
        typeof tx.appConfig?.upsert === 'function'
      ) {
        const baselineMarker = await tx.appConfig.findUnique({
          where: { id: ACCESS_CONTROL_BASELINE_V2_KEY },
        });
        if (!baselineMarker) {
          const backfillEntries = Object.entries(
            BASELINE_V2_ROLE_BACKFILL,
          ).flatMap(([roleCode, codes]) => {
            const roleId = roleIdByCode.get(roleCode as UserRoleDto);
            if (!roleId || !codes) return [];
            return codes
              .map((code) => permissionByCode.get(code))
              .filter((permissionId): permissionId is string =>
                Boolean(permissionId),
              )
              .map((permissionId) => ({ roleId, permissionId }));
          });

          if (backfillEntries.length > 0) {
            await tx.rolePermission.createMany({
              data: backfillEntries,
              skipDuplicates: true,
            });
          }

          await tx.appConfig.upsert({
            where: { id: ACCESS_CONTROL_BASELINE_V2_KEY },
            create: {
              id: ACCESS_CONTROL_BASELINE_V2_KEY,
              data: { version: 2, appliedAt: new Date().toISOString() },
            },
            update: {
              data: { version: 2, appliedAt: new Date().toISOString() },
            },
          });
        }
      }
    });
  }

  listPermissions() {
    return this.prisma.permission.findMany({
      orderBy: [{ module: 'asc' }, { action: 'asc' }],
    });
  }

  async listRoles() {
    const roles = await this.prisma.accessRole.findMany({
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { users: true } },
      },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
    return roles.map((role) => this.mapRole(role));
  }

  async getRole(id: string) {
    const role = await this.prisma.accessRole.findUnique({
      where: { id },
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { users: true } },
      },
    });
    if (!role) throw new NotFoundException('Rol no encontrado');
    return this.mapRole(role);
  }

  async create(dto: CreateAccessRoleDto, actor: AuthenticatedUser) {
    const permissionCodes = this.withRequiredReadPermissions(
      dto.permissionCodes,
    );
    await this.assertPermissionCodes(permissionCodes);
    const baseRole = toDbRole(dto.baseRole);
    this.assertPermissionsAllowedForBaseRole(baseRole, permissionCodes);
    const code = await this.uniqueCode(dto.name);
    const role = await this.prisma.accessRole.create({
      data: {
        code,
        name: dto.name,
        description: dto.description,
        baseRole,
        permissions: {
          create: permissionCodes.map((permissionCode) => ({
            permission: { connect: { code: permissionCode } },
          })),
        },
      },
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { users: true } },
      },
    });
    await this.audit(actor, 'ACCESS_ROLE_CREATED', {
      after: this.mapRole(role),
    });
    return this.mapRole(role);
  }

  async update(id: string, dto: UpdateAccessRoleDto, actor: AuthenticatedUser) {
    const before = await this.getRole(id);
    const role = await this.prisma.accessRole.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('Rol no encontrado');
    if (role.code === 'admin' && dto.permissionCodes) {
      throw new ForbiddenException(
        'Los permisos del rol Administrador están protegidos.',
      );
    }
    if (role.isSystem && dto.isActive === false) {
      throw new ForbiddenException(
        'Los roles del sistema no pueden desactivarse.',
      );
    }
    if (dto.isActive === false && before.userCount > 0) {
      throw new ConflictException(
        'Reasigna los usuarios de este rol antes de desactivarlo.',
      );
    }
    const permissionCodes = dto.permissionCodes
      ? this.withRequiredReadPermissions(dto.permissionCodes)
      : undefined;
    if (permissionCodes) {
      await this.assertPermissionCodes(permissionCodes);
      this.assertPermissionsAllowedForBaseRole(role.baseRole, permissionCodes);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "AccessRole" WHERE id = ${id} FOR UPDATE`;
      if (
        dto.isActive === false &&
        (await tx.user.count({ where: { accessRoleId: id } })) > 0
      ) {
        throw new ConflictException(
          'Reasigna los usuarios de este rol antes de desactivarlo.',
        );
      }
      await tx.accessRole.update({
        where: { id },
        data: {
          name: dto.name,
          description: dto.description,
          isActive: dto.isActive,
        },
      });
      if (permissionCodes) {
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        if (permissionCodes.length) {
          const permissions = await tx.permission.findMany({
            where: { code: { in: permissionCodes } },
          });
          await tx.rolePermission.createMany({
            data: permissions.map((permission) => ({
              roleId: id,
              permissionId: permission.id,
            })),
          });
        }
      }
      if (permissionCodes || dto.isActive !== undefined) {
        await tx.user.updateMany({
          where: { accessRoleId: id },
          data: { tokenVersion: { increment: 1 } },
        });
      }
    });

    const after = await this.getRole(id);
    await this.audit(actor, 'ACCESS_ROLE_UPDATED', { before, after });
    this.eventEmitter?.emit(SECURITY_SOCKETS_REVALIDATE_EVENT, {
      accessRoleId: id,
    });
    return after;
  }

  async remove(id: string, actor: AuthenticatedUser) {
    const role = await this.prisma.accessRole.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });
    if (!role) throw new NotFoundException('Rol no encontrado');
    if (role.isSystem) {
      throw new ForbiddenException(
        'Los roles del sistema no pueden eliminarse.',
      );
    }
    if (role._count.users > 0) {
      throw new ConflictException(
        'Reasigna los usuarios de este rol antes de eliminarlo.',
      );
    }
    await this.prisma.accessRole.delete({ where: { id } });
    await this.audit(actor, 'ACCESS_ROLE_DELETED', { role });
    return { success: true };
  }

  async assignRoleToUser(
    userId: string,
    accessRoleId: string,
    actor?: AuthenticatedUser,
  ) {
    const role = await this.prisma.accessRole.findUnique({
      where: { id: accessRoleId },
    });
    if (!role || !role.isActive) {
      throw new BadRequestException(
        'El rol seleccionado no existe o está inactivo.',
      );
    }
    const user = await this.prisma.$transaction(async (tx) => {
      const roles = await tx.$queryRaw<
        Array<{ isActive: boolean }>
      >`SELECT "isActive", pg_advisory_xact_lock(19731021)::text FROM "AccessRole" WHERE id = ${accessRoleId} FOR UPDATE`;
      if (!roles[0]?.isActive)
        throw new BadRequestException(
          'El rol seleccionado está inactivo o no existe',
        );
      const current = await tx.user?.findUnique?.({
        where: { id: userId },
        include: { accessRole: true },
      });
      const wasSystemAdmin =
        Boolean(current?.isActive) &&
        (current?.accessRole?.code === 'admin' ||
          (!current?.accessRoleId && current?.role === 'ADMIN'));
      const remainsSystemAdmin =
        role.code === 'admin' && role.isActive !== false;
      if (wasSystemAdmin && !remainsSystemAdmin && tx.user?.count) {
        const count = await tx.user.count({
          where: {
            isActive: true,
            role: 'ADMIN',
            OR: [
              { accessRoleId: null },
              { accessRole: { code: 'admin', isActive: true } },
            ],
          },
        });
        if (count <= 1) {
          throw new ConflictException(
            'No se puede desactivar o cambiar el rol del último administrador activo.',
          );
        }
      }
      return tx.user.update({
        where: { id: userId },
        data: {
          accessRoleId: role.id,
          role: role.baseRole,
          tokenVersion: { increment: 1 },
        },
      });
    });
    if (actor) {
      await this.audit(actor, 'USER_ACCESS_ROLE_ASSIGNED', {
        userId,
        accessRoleId,
        accessRoleName: role.name,
      });
    }
    this.eventEmitter?.emit(SECURITY_SOCKETS_REVALIDATE_EVENT, { userId });
    return user;
  }

  async authorizationForUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        accessRole: {
          include: { permissions: { include: { permission: true } } },
        },
      },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    const mappedRole = fromDbRole(user.role);
    const activeAccessRole =
      user.accessRole && user.accessRole.isActive !== false
        ? user.accessRole
        : undefined;
    return {
      accessRoleId: activeAccessRole?.id,
      accessRoleName: activeAccessRole?.name,
      permissions: user.accessRole
        ? user.accessRole.isActive !== false
          ? user.accessRole.permissions.map((item) => item.permission.code)
          : []
        : [...(DEFAULT_ROLE_PERMISSIONS[mappedRole] ?? [])],
    };
  }

  private async assertPermissionCodes(codes: string[]) {
    const unique = [...new Set(codes)];
    const count = await this.prisma.permission.count({
      where: { code: { in: unique } },
    });
    if (count !== unique.length) {
      throw new BadRequestException(
        'La selección contiene permisos no válidos.',
      );
    }
  }

  private assertPermissionsAllowedForBaseRole(
    baseRole: UserRole,
    codes: string[],
  ) {
    if (baseRole === UserRole.ADMIN) return;
    const adminOnlySet = new Set<string>(ADMIN_ONLY_PERMISSIONS);
    const disallowed = codes.filter((code) => adminOnlySet.has(code));
    if (disallowed.length > 0) {
      throw new BadRequestException(
        `Los siguientes permisos son exclusivos del perfil base Administrador: ${disallowed.join(', ')}`,
      );
    }
  }

  private withRequiredReadPermissions(codes: string[]) {
    const normalized = new Set(codes);
    const dependencies: Record<string, readonly string[]> = {
      'users.manage': ['users.read', 'roles.read'],
      'roles.manage': ['roles.read'],
      'products.manage': ['products.read'],
      'orders.manage': ['orders.read'],
      'orders.cancel': ['orders.read'],
      'invoices.cancel': ['orders.cancel', 'orders.read', 'invoices.read'],
      'tables.operate': ['tables.read'],
      'tables.configure': ['tables.read'],
      'tables.assign_zones': ['tables.read', 'users.directory'],
      'kitchen.update': ['kitchen.read'],
      'kitchen.configure': ['kitchen.read'],
      'delivery.manage': ['delivery.read'],
      'delivery.own': ['delivery.read'],
      'cash.open': ['cash.status', 'cash.read'],
      'cash.close': ['cash.status', 'cash.read'],
      'cash.configure': ['cash.read'],
      'reports.export': ['reports.read'],
      'customers.manage': ['customers.read'],
      'promotions.manage': ['promotions.read'],
      'settings.manage': ['settings.read'],
      'devices.manage': ['devices.read'],
      'backups.manage': ['backups.read'],
    };
    for (const code of [...normalized]) {
      for (const dependency of dependencies[code] ?? []) {
        normalized.add(dependency);
      }
    }
    return [...normalized];
  }

  private async uniqueCode(name: string) {
    const base =
      name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'rol';
    let code = base;
    let suffix = 2;
    while (await this.prisma.accessRole.findUnique({ where: { code } })) {
      code = `${base}_${suffix++}`;
    }
    return code;
  }

  private mapRole(role: {
    id: string;
    code: string;
    name: string;
    description: string | null;
    baseRole: UserRole;
    isSystem: boolean;
    isActive: boolean;
    permissions: { permission: { code: string } }[];
    _count: { users: number };
  }) {
    return {
      id: role.id,
      code: role.code,
      name: role.name,
      description: role.description ?? undefined,
      baseRole: role.baseRole.toLowerCase(),
      isSystem: role.isSystem,
      isActive: role.isActive,
      permissionCodes: role.permissions
        .map((item) => item.permission.code)
        .sort(),
      userCount: role._count.users,
    };
  }

  private async audit(
    actor: AuthenticatedUser,
    action: string,
    details: unknown,
  ) {
    await this.prisma.systemLog.create({
      data: {
        userId: actor.id,
        user: actor.username,
        role: actor.accessRoleName || actor.role,
        action,
        details: JSON.stringify(details),
        level: LogLevel.INFO,
      },
    });
  }
}
