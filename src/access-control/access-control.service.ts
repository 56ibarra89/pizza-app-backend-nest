import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { LogLevel, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import type { CreateAccessRoleDto } from './dto/create-access-role.dto';
import type { UpdateAccessRoleDto } from './dto/update-access-role.dto';
import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSION_CATALOG,
  SYSTEM_ROLE_NAMES,
} from './permission-catalog';
import { toDbRole } from '../users/mappers/user-role.mapper';
import { UserRoleDto } from '../common';

@Injectable()
export class AccessControlService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

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
    const code = await this.uniqueCode(dto.name);
    const role = await this.prisma.accessRole.create({
      data: {
        code,
        name: dto.name,
        description: dto.description,
        baseRole: toDbRole(dto.baseRole),
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
    if (permissionCodes) await this.assertPermissionCodes(permissionCodes);

    await this.prisma.$transaction(async (tx) => {
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
        await tx.user.updateMany({
          where: { accessRoleId: id },
          data: { tokenVersion: { increment: 1 } },
        });
      }
    });

    const after = await this.getRole(id);
    await this.audit(actor, 'ACCESS_ROLE_UPDATED', { before, after });
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
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        accessRoleId: role.id,
        role: role.baseRole,
        tokenVersion: { increment: 1 },
      },
    });
    if (actor) {
      await this.audit(actor, 'USER_ACCESS_ROLE_ASSIGNED', {
        userId,
        accessRoleId,
        accessRoleName: role.name,
      });
    }
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
    return {
      accessRoleId: user.accessRole?.id,
      accessRoleName: user.accessRole?.name,
      permissions:
        user.accessRole?.permissions.map((item) => item.permission.code) ?? [],
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

  private withRequiredReadPermissions(codes: string[]) {
    const normalized = new Set(codes);
    const dependencies: Record<string, readonly string[]> = {
      'users.manage': ['users.read', 'roles.read'],
      'roles.manage': ['roles.read'],
      'products.manage': ['products.read'],
      'orders.manage': ['orders.read'],
      'orders.cancel': ['orders.read'],
      'tables.operate': ['tables.read'],
      'tables.configure': ['tables.read'],
      'tables.assign_zones': ['tables.read'],
      'kitchen.update': ['kitchen.read'],
      'kitchen.configure': ['kitchen.read'],
      'delivery.manage': ['delivery.read'],
      'delivery.own': ['delivery.read'],
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
