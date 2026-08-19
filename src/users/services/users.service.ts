import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  HttpException,
  HttpStatus,
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
    const passwordHash = dto.password ? await this.hasher.hash(dto.password) : undefined;
    try {
        return await this.repo.create({
          username: dto.username.toLowerCase(),
          email: dto.email ? dto.email.toLowerCase() : undefined,
          firstName: dto.firstName,
          lastName: dto.lastName,
          pin: dto.pin,
          passwordHash,
          role: dto.role,
          isActive: dto.isActive ?? true,
          workDays: dto.workDays as any,
        });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Usuario/email/pin ya existe');
      }
      throw e;
    }
  }

  async update(id: string, dto: UpdateUserDto) {
    const passwordHash =
      dto.password !== undefined ? await this.hasher.hash(dto.password) : undefined;

    try {
        return await this.repo.update(id, {
          username: dto.username ? dto.username.toLowerCase() : undefined,
          email: dto.email === undefined ? undefined : (dto.email ? dto.email.toLowerCase() : null),
          firstName: dto.firstName,
          lastName: dto.lastName,
          pin: dto.pin,
          passwordHash: passwordHash !== undefined ? passwordHash : undefined,
          role: dto.role,
          isActive: dto.isActive,
          themePreference: dto.themePreference,
          workDays: dto.workDays as any,
        });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Usuario/email/pin ya existe');
      }
      throw e;
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
  }): Promise<{ success: boolean; username?: string; role?: UserRoleDto; email?: string; firstName?: string; lastName?: string; access_token?: string; themePreference?: string }> {
    const idLower = params.identifier.toLowerCase();

    const user =
      (await this.repo.findByUsername(idLower)) ??
      (await this.repo.findByEmail(idLower));

    if (!user || !user.isActive) return { success: false };

    this.lockoutService.assertCanAuthenticate(user);

    if (!user.passwordHash) return { success: false };

    const ok = await this.hasher.verify(params.password, user.passwordHash);
    if (!ok) {
      await this.repo.update(user.id, this.lockoutService.createFailedAttemptUpdate(user));
      return { success: false };
    }

    await this.repo.update(user.id, this.lockoutService.createSuccessfulAttemptUpdate());
    const access_token = this.jwtService.sign({ sub: user.id, tokenVersion: user.tokenVersion });
    return { success: true, username: user.username, role: user.role, email: user.email ?? undefined, firstName: user.firstName, lastName: user.lastName, access_token, themePreference: user.themePreference };
  }

  async loginWithPin(pin: string): Promise<{ username: string; role: UserRoleDto; firstName: string; lastName: string; access_token: string; themePreference: string } | null> {
    const user = await this.repo.findByPin(pin);
    if (!user || !user.isActive) return null;

    this.lockoutService.assertCanAuthenticate(user);

    await this.repo.update(user.id, this.lockoutService.createSuccessfulAttemptUpdate());
    const access_token = this.jwtService.sign({ sub: user.id, tokenVersion: user.tokenVersion });
    return { username: user.username, role: user.role, firstName: user.firstName, lastName: user.lastName, access_token, themePreference: user.themePreference };
  }

  async requireValidPin(pin: string): Promise<{ username: string; role: UserRoleDto }> {
    const result = await this.loginWithPin(pin);
    if (!result) throw new UnauthorizedException('PIN inválido');
    return result;
  }

  async requestPasswordReset(identifier: string) {
    const idLower = identifier.toLowerCase();
    const user =
      (await this.repo.findByUsername(idLower)) ??
      (await this.repo.findByEmail(idLower));

    if (!user || !user.isActive) {
      throw new NotFoundException('Usuario no encontrado o inactivo');
    }

    if (user.role !== 'admin') {
      throw new UnauthorizedException('Solo los administradores pueden usar esta función. Contacte a su supervisor.');
    }

    if (!user.email) {
      throw new UnauthorizedException('El administrador no tiene un correo configurado.');
    }

    const token = this.jwtService.sign({ sub: user.id, tokenVersion: user.tokenVersion });
    const resetLink = `http://localhost:5173/#/reset-password?token=${token}`;

    const email = this.passwordResetEmailService.buildResetMail(user.firstName, resetLink);

    try {
      await this.mailerService.sendMail({
        to: user.email,
        subject: email.subject,
        text: email.text,
        html: email.html,
      });
      return { success: true, message: 'Correo enviado' };
    } catch (error: any) {
      console.error("Error enviando correo:", error);
      throw new HttpException(
        `Error enviando correo: ${error.message || 'Desconocido'}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async resetPassword(token: string, newPassword: string) {
    try {
      // Verificar el token
      const payload = this.jwtService.verify(token);
      const userId = payload.sub;

      const user = await this.repo.findById(userId);
      if (!user) {
        throw new NotFoundException('Usuario no encontrado');
      }

      // Encriptar nueva contraseña
      const hashedPassword = await this.hasher.hash(newPassword);

      // Actualizar en la DB
      await this.repo.update(userId, {
        passwordHash: hashedPassword,
      });

      return { success: true, message: 'Contraseña actualizada exitosamente' };
    } catch (error) {
      throw new UnauthorizedException('Enlace inválido o expirado. Solicita uno nuevo.');
    }
  }

  async revokeAllTokens(userId: string) {
    const user = await this.repo.findById(userId);
    if (!user) throw new NotFoundException('Usuario no encontrado');

    return await this.repo.update(userId, {
      tokenVersion: user.tokenVersion + 1,
    });
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
    return assignments.map(a => ({ day: a.day, floor: a.floor }));
  }

  async updateWaiterZones(userId: string, zones: { day: string, floor: number }[]) {
    // We can delete all and recreate, or upsert. Delete + Create is easier.
    await this.prisma.$transaction(async (tx) => {
      await tx.waiterZoneAssignment.deleteMany({
        where: { userId },
      });
      if (zones.length > 0) {
        await tx.waiterZoneAssignment.createMany({
          data: zones.map(z => ({
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

