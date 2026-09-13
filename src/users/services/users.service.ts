import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  HttpException,
} from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  USERS_REPOSITORY,
  type IUsersRepository,
} from '../interfaces/users.repository';
import type { CreateUserDto } from '../dto/create-user.dto';
import type { UpdateUserDto } from '../dto/update-user.dto';
import { PasswordHasherService } from './password-hasher.service';
import type { UserRoleDto } from '../dto/user-role.dto';
import { UserLockoutService } from './user-lockout.service';
import { PasswordResetEmailService } from './password-reset-email.service';
import { PinHasherService } from '../../common/security/pin-hasher.service';
import type { UpdateOwnProfileDto } from '../dto/update-own-profile.dto';
import { PinAttemptService } from '../../common/security/pin-attempt.service';
import { createHash } from 'node:crypto';

interface PasswordResetJwtPayload {
  sub: string;
  tokenVersion: number;
  type: 'password_reset';
}

function isPasswordResetJwtPayload(
  payload: unknown,
): payload is PasswordResetJwtPayload {
  if (typeof payload !== 'object' || payload === null) return false;
  const candidate = payload as Record<string, unknown>;
  return (
    candidate.type === 'password_reset' &&
    typeof candidate.sub === 'string' &&
    Number.isInteger(candidate.tokenVersion)
  );
}

function securityScope(kind: string, source: string): string {
  const digest = createHash('sha256').update(source).digest('hex');
  return `${kind}:${digest}`;
}

async function waitForMinimumDuration(startedAt: number, minimumMs = 300) {
  const remaining = minimumMs - (Date.now() - startedAt);
  if (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }
}

@Injectable()
export class UsersService {
  constructor(
    @Inject(USERS_REPOSITORY) private readonly repo: IUsersRepository,
    private readonly hasher: PasswordHasherService,
    private readonly lockoutService: UserLockoutService,
    private readonly passwordResetEmailService: PasswordResetEmailService,
    private readonly mailerService: MailerService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly pinHasher: PinHasherService,
    private readonly authAttempts: PinAttemptService,
  ) {}

  getAll() {
    return this.repo.getAll();
  }

  async getById(id: string) {
    const found = await this.repo.findById(id);
    if (!found) throw new NotFoundException('Usuario no encontrado');
    return found;
  }

  async getByUsername(username: string) {
    const found = await this.repo.findByUsername(username.toLowerCase());
    if (!found) throw new NotFoundException('Usuario no encontrado');
    return found;
  }

  async create(dto: CreateUserDto) {
    const [passwordHash, pinHash] = await Promise.all([
      dto.password
        ? this.hasher.hash(dto.password)
        : Promise.resolve(undefined),
      this.pinHasher.hash(dto.pin),
    ]);
    try {
      return await this.repo.create({
        username: dto.username.toLowerCase(),
        email: dto.email ? dto.email.toLowerCase() : undefined,
        firstName: dto.firstName,
        lastName: dto.lastName,
        pinHash,
        pinLookup: this.pinHasher.lookup(dto.pin),
        passwordHash,
        role: dto.role,
        isActive: dto.isActive ?? true,
        workDays: dto.workDays as any,
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('Usuario/email/pin ya existe');
      }
      throw e;
    }
  }

  async update(id: string, dto: UpdateUserDto) {
    const current = await this.repo.findById(id);
    if (!current) throw new NotFoundException('Usuario no encontrado');
    const [passwordHash, pinHash] = await Promise.all([
      dto.password !== undefined
        ? this.hasher.hash(dto.password)
        : Promise.resolve(undefined),
      dto.pin !== undefined
        ? this.pinHasher.hash(dto.pin)
        : Promise.resolve(undefined),
    ]);
    const revokesSessions =
      dto.password !== undefined ||
      dto.pin !== undefined ||
      dto.role !== undefined ||
      dto.isActive === false;

    try {
      return await this.repo.update(id, {
        username: dto.username ? dto.username.toLowerCase() : undefined,
        email:
          dto.email === undefined
            ? undefined
            : dto.email
              ? dto.email.toLowerCase()
              : null,
        firstName: dto.firstName,
        lastName: dto.lastName,
        pinHash,
        pinLookup: dto.pin ? this.pinHasher.lookup(dto.pin) : undefined,
        passwordHash: passwordHash !== undefined ? passwordHash : undefined,
        role: dto.role,
        isActive: dto.isActive,
        themePreference: dto.themePreference,
        workDays: dto.workDays as any,
        tokenVersion: revokesSessions ? current.tokenVersion + 1 : undefined,
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('Usuario/email/pin ya existe');
      }
      throw e;
    }
  }

  async updateOwnProfile(id: string, dto: UpdateOwnProfileDto) {
    const current = await this.repo.findById(id);
    if (!current) throw new NotFoundException('Usuario no encontrado');

    const changesCredential =
      dto.password !== undefined || dto.pin !== undefined;
    if (changesCredential) {
      if (!dto.currentPassword || !current.passwordHash) {
        throw new UnauthorizedException(
          'La contraseña actual es obligatoria para cambiar credenciales.',
        );
      }
      const validPassword = await this.hasher.verify(
        dto.currentPassword,
        current.passwordHash,
      );
      if (!validPassword) {
        throw new UnauthorizedException('La contraseña actual es incorrecta.');
      }
    }

    const [passwordHash, pinHash] = await Promise.all([
      dto.password
        ? this.hasher.hash(dto.password)
        : Promise.resolve(undefined),
      dto.pin ? this.pinHasher.hash(dto.pin) : Promise.resolve(undefined),
    ]);

    try {
      return await this.repo.update(id, {
        username: dto.username?.toLowerCase(),
        email:
          dto.email === undefined
            ? undefined
            : dto.email
              ? dto.email.toLowerCase()
              : null,
        firstName: dto.firstName,
        lastName: dto.lastName,
        themePreference: dto.themePreference,
        passwordHash,
        pinHash,
        pinLookup: dto.pin ? this.pinHasher.lookup(dto.pin) : undefined,
        tokenVersion: changesCredential ? current.tokenVersion + 1 : undefined,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Usuario/email/pin ya existe');
      }
      throw error;
    }
  }

  async delete(id: string) {
    const user = await this.repo.findById(id);
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return await this.repo.update(id, { isActive: false });
  }

  async unlockUser(id: string) {
    const user = await this.repo.findById(id);
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return await this.repo.update(id, {
      failedLoginAttempts: 0,
      lockoutLevel: 0,
      lockedUntil: null,
    });
  }

  async loginWithPassword(params: {
    identifier: string;
    password: string;
    source?: string;
  }): Promise<{
    success: boolean;
    username?: string;
    role?: UserRoleDto;
    email?: string;
    firstName?: string;
    lastName?: string;
    access_token?: string;
    themePreference?: string;
  }> {
    const idLower = params.identifier.toLowerCase();
    const sourceScope = securityScope(
      'password-source',
      params.source || 'unknown',
    );
    await this.authAttempts.assertAllowed(sourceScope);

    const user = await this.repo.findByIdentifier(idLower);

    if (!user || !user.isActive) {
      await this.hasher.hash(params.password);
      await this.authAttempts.registerFailure(sourceScope);
      return { success: false };
    }

    this.lockoutService.assertCanAuthenticate(user);

    if (!user.passwordHash) {
      await this.hasher.hash(params.password);
      await this.authAttempts.registerFailure(sourceScope);
      return { success: false };
    }

    const ok = await this.hasher.verify(params.password, user.passwordHash);
    if (!ok) {
      await Promise.all([
        this.repo.registerFailedLoginAttempt(user.id),
        this.authAttempts.registerFailure(sourceScope),
      ]);
      return { success: false };
    }

    await Promise.all([
      this.repo.registerSuccessfulLogin(user.id),
      this.authAttempts.registerSuccess(sourceScope),
    ]);
    const access_token = this.jwtService.sign({
      sub: user.id,
      tokenVersion: user.tokenVersion,
      type: 'access',
    });
    return {
      success: true,
      username: user.username,
      role: user.role,
      email: user.email ?? undefined,
      firstName: user.firstName,
      lastName: user.lastName,
      access_token,
      themePreference: user.themePreference,
    };
  }

  async loginWithPin(
    pin: string,
    source = 'unknown',
  ): Promise<{
    username: string;
    role: UserRoleDto;
    firstName: string;
    lastName: string;
    access_token: string;
    themePreference: string;
  } | null> {
    const user = await this.repo.findByPin(pin, {
      attemptScopes: [securityScope('pin-source-v2', source)],
      exposeLockout: true,
    });
    if (!user) return null;

    this.lockoutService.assertCanAuthenticate(user);

    await this.repo.registerSuccessfulLogin(user.id);
    const access_token = this.jwtService.sign({
      sub: user.id,
      tokenVersion: user.tokenVersion,
      type: 'access',
    });
    return {
      username: user.username,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      access_token,
      themePreference: user.themePreference,
    };
  }

  async requireValidPin(
    pin: string,
  ): Promise<{ username: string; role: UserRoleDto }> {
    const result = await this.loginWithPin(pin);
    if (!result) throw new UnauthorizedException('PIN inválido');
    return result;
  }

  async requestPasswordReset(identifier: string, source = 'unknown') {
    const startedAt = Date.now();
    const genericResponse = {
      success: true,
      message:
        'Si el usuario o correo es válido y cumple los requisitos, se enviarán las instrucciones.',
    };
    const sourceScope = securityScope('reset-source', source);
    await this.authAttempts.assertAllowed(sourceScope);
    await this.authAttempts.registerFailure(sourceScope);

    const idLower = identifier.toLowerCase();
    const user = await this.repo.findByIdentifier(idLower);

    if (!user || !user.isActive || user.role !== 'admin' || !user.email) {
      await waitForMinimumDuration(startedAt);
      return genericResponse;
    }

    const resetWindowStart = new Date(Date.now() - 15 * 60_000);
    const reservation = await this.prisma.user.updateMany({
      where: {
        id: user.id,
        OR: [
          { passwordResetRequestedAt: null },
          { passwordResetRequestedAt: { lte: resetWindowStart } },
        ],
      },
      data: { passwordResetRequestedAt: new Date() },
    });
    if (reservation.count !== 1) {
      await waitForMinimumDuration(startedAt);
      return genericResponse;
    }

    const token = this.jwtService.sign(
      { sub: user.id, tokenVersion: user.tokenVersion, type: 'password_reset' },
      { expiresIn: '15m' },
    );
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const resetLink = `${frontendUrl}/#/reset-password?token=${token}`;

    const email = this.passwordResetEmailService.buildResetMail(
      user.firstName,
      resetLink,
    );

    void this.mailerService
      .sendMail({
        to: user.email,
        subject: email.subject,
        text: email.text,
        html: email.html,
      })
      .catch((error: unknown) => {
        console.error('Error enviando correo de recuperación:', error);
      });
    await waitForMinimumDuration(startedAt);
    return genericResponse;
  }

  async resetPassword(token: string, newPassword: string) {
    try {
      // Verificar el token
      const payload: unknown = this.jwtService.verify(token);
      if (!isPasswordResetJwtPayload(payload)) {
        throw new UnauthorizedException(
          'Token no válido para restablecimiento de contraseña.',
        );
      }
      const userId = payload.sub;

      const hashedPassword = await this.hasher.hash(newPassword);
      const consumed = await this.prisma.user.updateMany({
        where: {
          id: userId,
          isActive: true,
          tokenVersion: payload.tokenVersion,
        },
        data: {
          passwordHash: hashedPassword,
          tokenVersion: { increment: 1 },
          failedLoginAttempts: 0,
          lockoutLevel: 0,
          lockedUntil: null,
          passwordResetRequestedAt: null,
        },
      });
      if (consumed.count !== 1) {
        throw new UnauthorizedException(
          'El enlace de restablecimiento ya fue utilizado o dejó de ser válido.',
        );
      }

      return { success: true, message: 'Contraseña actualizada exitosamente' };
    } catch (error: unknown) {
      if (error instanceof HttpException) throw error;
      throw new UnauthorizedException(
        'Enlace inválido o expirado. Solicita uno nuevo.',
      );
    }
  }

  async revokeAllTokens(userId: string) {
    const user = await this.repo.findById(userId);
    if (!user) throw new NotFoundException('Usuario no encontrado');

    return await this.repo.incrementTokenVersion(userId);
  }

  async addExtraDay(userId: string, date: string, notes?: string) {
    const user = await this.repo.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    // date from frontend should be YYYY-MM-DD
    const parsedDate = new Date(`${date}T00:00:00.000Z`);

    await this.prisma.userExtraDay.upsert({
      where: {
        userId_date: {
          userId,
          date: parsedDate,
        },
      },
      create: {
        userId,
        date: parsedDate,
        notes,
      },
      update: {
        notes,
      },
    });

    return { success: true };
  }

  async removeExtraDay(userId: string, date: string) {
    const parsedDate = new Date(`${date}T00:00:00.000Z`);

    try {
      await this.prisma.userExtraDay.delete({
        where: {
          userId_date: {
            userId,
            date: parsedDate,
          },
        },
      });
    } catch (e) {
      // Ignorar si no existe
    }

    return { success: true };
  }

  async getDeliveryStats(dateStr: string) {
    const [year, month, day] = dateStr.split('-').map(Number);
    const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0);
    const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);

    // Only count DELIVERED orders, or all orders assigned to driver?
    // Usually they want to see how many were completed today, so DELIVERED.
    const stats = await this.prisma.order.groupBy({
      by: ['driverId'],
      where: {
        driverId: { not: null },
        status: { not: 'CANCELLED' },
        createdAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      _count: {
        id: true,
      },
    });

    return stats.map((s) => ({
      userId: s.driverId,
      todayDeliveries: s._count.id,
    }));
  }

  async getWaiterZones(userId: string) {
    const assignments = await this.prisma.waiterZoneAssignment.findMany({
      where: { userId },
    });
    return assignments.map((a) => ({ day: a.day, floor: a.floor }));
  }

  async updateWaiterZones(
    userId: string,
    zones: { day: string; floor: number }[],
  ) {
    // We can delete all and recreate, or upsert. Delete + Create is easier.
    await this.prisma.$transaction(async (tx) => {
      await tx.waiterZoneAssignment.deleteMany({
        where: { userId },
      });
      if (zones.length > 0) {
        await tx.waiterZoneAssignment.createMany({
          data: zones.map((z) => ({
            userId,
            day: z.day as any,
            floor: z.floor,
          })),
        });
      }
    });
    return { success: true };
  }
}
