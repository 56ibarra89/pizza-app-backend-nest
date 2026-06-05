import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { IUsersRepository } from '../interfaces/users.repository';
import type { UserEntity } from '../entities/user.entity';
import type { UserRoleDto } from '../dto/user-role.dto';
import { fromDbRole, toDbRole } from '../mappers/user-role.mapper';

@Injectable()
export class PrismaUsersRepository implements IUsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getAll(): Promise<UserEntity[]> {
    const users = await this.prisma.user.findMany({
      orderBy: { username: 'asc' },
    });
    return users.map((u) => this.mapUser(u));
  }

  async findById(id: string): Promise<UserEntity | null> {
    const found = await this.prisma.user.findUnique({ where: { id } });
    return found ? this.mapUser(found) : null;
  }

  async findByUsername(username: string): Promise<UserEntity | null> {
    const found = await this.prisma.user.findUnique({ where: { username } });
    return found ? this.mapUser(found) : null;
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    const found = await this.prisma.user.findUnique({ where: { email } });
    return found ? this.mapUser(found) : null;
  }

  async findByPin(pin: string): Promise<UserEntity | null> {
    const found = await this.prisma.user.findUnique({ where: { pin } });
    return found ? this.mapUser(found) : null;
  }

  async create(data: {
    username: string;
    email?: string;
    firstName: string;
    lastName: string;
    pin: string;
    passwordHash?: string;
    role: UserRoleDto;
    isActive: boolean;
  }): Promise<UserEntity> {
    const created = await this.prisma.user.create({
      data: {
        username: data.username,
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        pin: data.pin,
        passwordHash: data.passwordHash,
        role: toDbRole(data.role),
        isActive: data.isActive,
      },
    });
    return this.mapUser(created);
  }

  async update(
    id: string,
    data: {
      username?: string;
      email?: string | null;
      firstName?: string;
      lastName?: string;
      pin?: string;
      passwordHash?: string | null;
      role?: UserRoleDto;
      isActive?: boolean;
      failedLoginAttempts?: number;
      lockoutLevel?: number;
      lockedUntil?: Date | null;
      lastVisit?: Date | null;
    },
  ): Promise<UserEntity> {
    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        username: data.username,
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        pin: data.pin,
        passwordHash: data.passwordHash,
        role: data.role ? toDbRole(data.role) : undefined,
        isActive: data.isActive,
        failedLoginAttempts: data.failedLoginAttempts,
        lockoutLevel: data.lockoutLevel,
        lockedUntil: data.lockedUntil,
        lastVisit: data.lastVisit,
      },
    });

    return this.mapUser(updated);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.user.delete({ where: { id } });
  }

  private mapUser(u: {
    id: string;
    username: string;
    email: string | null;
    firstName: string;
    lastName: string;
    pin: string;
    passwordHash: string | null;
    role: import('@prisma/client').UserRole;
    isActive: boolean;
    failedLoginAttempts: number;
    lockoutLevel: number;
    lockedUntil: Date | null;
    lastVisit: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): UserEntity {
    return {
      id: u.id,
      username: u.username,
      email: u.email ?? undefined,
      firstName: u.firstName,
      lastName: u.lastName,
      pin: u.pin,
      passwordHash: u.passwordHash ?? undefined,
      role: fromDbRole(u.role),
      isActive: u.isActive,
      failedLoginAttempts: u.failedLoginAttempts,
      lockoutLevel: u.lockoutLevel,
      lockedUntil: u.lockedUntil ?? undefined,
      lastVisit: u.lastVisit ?? undefined,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    };
  }
}
