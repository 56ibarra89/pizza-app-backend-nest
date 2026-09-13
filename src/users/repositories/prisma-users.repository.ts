import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { IUsersRepository } from '../interfaces/users.repository';
import type { UserEntity } from '../entities/user.entity';
import type { UserRoleDto } from '../dto/user-role.dto';
import { fromDbRole, toDbRole } from '../mappers/user-role.mapper';
import { PinHasherService } from '../../common/security/pin-hasher.service';
import { PinAttemptService } from '../../common/security/pin-attempt.service';

@Injectable()
export class PrismaUsersRepository implements IUsersRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pinHasher: PinHasherService,
    private readonly pinAttempts: PinAttemptService,
  ) {}

  async getAll(): Promise<UserEntity[]> {
    const users = await this.prisma.user.findMany({
      orderBy: { username: 'asc' },
      include: { extraDays: true },
    });
    return users.map((u) => this.mapUser(u));
  }

  async findById(id: string): Promise<UserEntity | null> {
    const found = await this.prisma.user.findUnique({
      where: { id },
      include: { extraDays: true },
    });
    return found ? this.mapUser(found) : null;
  }

  async findByUsername(username: string): Promise<UserEntity | null> {
    const found = await this.prisma.user.findUnique({
      where: { username },
      include: { extraDays: true },
    });
    return found ? this.mapUser(found) : null;
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    const found = await this.prisma.user.findUnique({
      where: { email },
      include: { extraDays: true },
    });
    return found ? this.mapUser(found) : null;
  }

  async findByIdentifier(identifier: string): Promise<UserEntity | null> {
    const found = await this.prisma.user.findFirst({
      where: {
        OR: [{ username: identifier }, { email: identifier }],
      },
      include: { extraDays: true },
    });
    return found ? this.mapUser(found) : null;
  }

  async findByPin(
    pin: string,
    options: {
      allowedRoles?: UserRoleDto[];
      attemptScope?: string;
      attemptScopes?: string[];
      exposeLockout?: boolean;
    } = {},
  ): Promise<UserEntity | null> {
    const scopes = options.attemptScopes?.length
      ? options.attemptScopes
      : [options.attemptScope || 'pin-login'];
    await this.pinAttempts.assertAllowed(scopes);

    const found = await this.prisma.user.findUnique({
      where: { pinLookup: this.pinHasher.lookup(pin) },
      include: { extraDays: true },
    });
    const hashMatches = found?.pinHash
      ? await this.pinHasher.verify(pin, found.pinHash)
      : false;
    if (!found?.pinHash) {
      await this.pinHasher.consumeVerificationTime(pin);
    }

    const mapped = found && hashMatches ? this.mapUser(found) : null;
    const roleAllowed =
      !options.allowedRoles?.length ||
      (mapped ? options.allowedRoles.includes(mapped.role) : false);
    if (!mapped || !mapped.isActive || !roleAllowed) {
      const lockout = await this.pinAttempts.registerPinFailure(scopes);
      if (options.exposeLockout) {
        throw new HttpException(
          {
            statusCode: HttpStatus.UNAUTHORIZED,
            message: 'PIN incorrecto.',
            retryAfterSeconds: lockout.retryAfterSeconds,
          },
          HttpStatus.UNAUTHORIZED,
        );
      }
      return null;
    }

    await this.pinAttempts.registerSuccess(scopes);
    return mapped;
  }

  async registerFailedLoginAttempt(id: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE "User"
      SET
        "failedLoginAttempts" = CASE
          WHEN "failedLoginAttempts" + 1 >= 5 THEN 0
          ELSE "failedLoginAttempts" + 1
        END,
        "lockoutLevel" = CASE
          WHEN "failedLoginAttempts" + 1 >= 5 THEN LEAST("lockoutLevel" + 1, 3)
          ELSE "lockoutLevel"
        END,
        "lockedUntil" = CASE
          WHEN "failedLoginAttempts" + 1 >= 5 THEN
            (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + (
              CASE LEAST("lockoutLevel", 3)
                WHEN 0 THEN INTERVAL '30 seconds'
                WHEN 1 THEN INTERVAL '60 seconds'
                WHEN 2 THEN INTERVAL '120 seconds'
                ELSE INTERVAL '300 seconds'
              END
            )
          ELSE "lockedUntil"
        END,
        "updatedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
      WHERE "id" = ${id}
    `;
  }

  async registerSuccessfulLogin(id: string): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: {
        lastVisit: new Date(),
        failedLoginAttempts: 0,
        lockoutLevel: 0,
        lockedUntil: null,
      },
    });
  }

  async incrementTokenVersion(id: string): Promise<UserEntity> {
    const updated = await this.prisma.user.update({
      where: { id },
      data: { tokenVersion: { increment: 1 } },
      include: { extraDays: true },
    });
    return this.mapUser(updated);
  }

  async create(data: {
    username: string;
    email?: string;
    firstName: string;
    lastName: string;
    pinHash: string;
    pinLookup: string;
    passwordHash?: string;
    role: UserRoleDto;
    isActive: boolean;
    workDays?: string[];
  }): Promise<UserEntity> {
    const created = await this.prisma.user.create({
      data: {
        username: data.username,
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        pinHash: data.pinHash,
        pinLookup: data.pinLookup,
        passwordHash: data.passwordHash,
        role: toDbRole(data.role),
        isActive: data.isActive,
        workDays: data.workDays as any,
      },
      include: { extraDays: true },
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
      pinHash?: string;
      pinLookup?: string;
      passwordHash?: string | null;
      role?: UserRoleDto;
      isActive?: boolean;
      failedLoginAttempts?: number;
      lockoutLevel?: number;
      lockedUntil?: Date | null;
      lastVisit?: Date | null;
      themePreference?: string;
      tokenVersion?: number;
      workDays?: string[];
    },
  ): Promise<UserEntity> {
    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        username: data.username,
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        pinHash: data.pinHash,
        pinLookup: data.pinLookup,
        passwordHash: data.passwordHash,
        role: data.role ? toDbRole(data.role) : undefined,
        isActive: data.isActive,
        failedLoginAttempts: data.failedLoginAttempts,
        lockoutLevel: data.lockoutLevel,
        lockedUntil: data.lockedUntil,
        lastVisit: data.lastVisit,
        themePreference: data.themePreference,
        tokenVersion: data.tokenVersion,
        workDays: data.workDays as any,
      },
      include: { extraDays: true },
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
    pinHash: string | null;
    pinLookup: string | null;
    passwordHash: string | null;
    role: import('@prisma/client').UserRole;
    isActive: boolean;
    failedLoginAttempts: number;
    lockoutLevel: number;
    lockedUntil: Date | null;
    lastVisit: Date | null;
    themePreference: string;
    tokenVersion: number;
    createdAt: Date;
    updatedAt: Date;
    workDays?: any[];
    extraDays?: any[];
  }): UserEntity {
    return {
      id: u.id,
      username: u.username,
      email: u.email ?? undefined,
      firstName: u.firstName,
      lastName: u.lastName,
      pinHash: u.pinHash ?? undefined,
      passwordHash: u.passwordHash ?? undefined,
      role: fromDbRole(u.role),
      isActive: u.isActive,
      failedLoginAttempts: u.failedLoginAttempts,
      lockoutLevel: u.lockoutLevel,
      lockedUntil: u.lockedUntil ?? undefined,
      lastVisit: u.lastVisit ?? undefined,
      themePreference: u.themePreference,
      tokenVersion: u.tokenVersion,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
      workDays: u.workDays as string[],
      extraDays: u.extraDays?.map((ed) => ({ date: ed.date, notes: ed.notes })),
    };
  }
}
