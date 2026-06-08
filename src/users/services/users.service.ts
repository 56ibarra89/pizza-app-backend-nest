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
import {
  USERS_REPOSITORY,
  type IUsersRepository,
} from '../interfaces/users.repository';
import type { CreateUserDto } from '../dto/create-user.dto';
import type { UpdateUserDto } from '../dto/update-user.dto';
import { PasswordHasherService } from './password-hasher.service';
import type { UserRoleDto } from '../dto/user-role.dto';

@Injectable()
export class UsersService {
  constructor(
    @Inject(USERS_REPOSITORY) private readonly repo: IUsersRepository,
    private readonly hasher: PasswordHasherService,
    private readonly mailerService: MailerService,
    private readonly jwtService: JwtService,
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

  private async checkLockout(user: import('../entities/user.entity').UserEntity) {
    if (user.lockedUntil) {
      if (new Date() < user.lockedUntil) {
        throw new UnauthorizedException(`Cuenta bloqueada temporalmente hasta ${user.lockedUntil.toLocaleString()}`);
      } else if (user.lockoutLevel >= 4) {
        throw new UnauthorizedException('Cuenta suspendida. Contacte a un administrador.');
      }
    }
  }

  private async handleFailedAttempt(user: import('../entities/user.entity').UserEntity) {
    let newAttempts = user.failedLoginAttempts + 1;
    let newLevel = user.lockoutLevel;
    let newLockedUntil = user.lockedUntil;

    if (newAttempts >= 5) {
      newAttempts = 0;
      newLevel += 1;
      const now = new Date();
      if (newLevel === 1) {
        newLockedUntil = new Date(now.getTime() + 5 * 60000); // 5 mins
      } else if (newLevel === 2) {
        newLockedUntil = new Date(now.getTime() + 15 * 60000); // 15 mins
      } else if (newLevel === 3) {
        newLockedUntil = new Date(now.getTime() + 60 * 60000); // 1 hour
      } else {
        newLockedUntil = new Date(now.getTime() + 36500 * 24 * 60 * 60000); // Suspension (100 years approx)
      }
    }

    await this.repo.update(user.id, {
      failedLoginAttempts: newAttempts,
      lockoutLevel: newLevel,
      lockedUntil: newLockedUntil,
    });
  }

  private async handleSuccessfulAttempt(user: import('../entities/user.entity').UserEntity) {
    await this.repo.update(user.id, {
      lastVisit: new Date(),
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
    
    await this.checkLockout(user);

    if (!user.passwordHash) return { success: false };

    const ok = await this.hasher.verify(params.password, user.passwordHash);
    if (!ok) {
      await this.handleFailedAttempt(user);
      return { success: false };
    }

    await this.handleSuccessfulAttempt(user);
    const access_token = this.jwtService.sign({ sub: user.id, tokenVersion: user.tokenVersion });
    return { success: true, username: user.username, role: user.role, email: user.email ?? undefined, firstName: user.firstName, lastName: user.lastName, access_token, themePreference: user.themePreference };
  }

  async loginWithPin(pin: string): Promise<{ username: string; role: UserRoleDto; firstName: string; lastName: string; access_token: string; themePreference: string } | null> {
    const user = await this.repo.findByPin(pin);
    if (!user || !user.isActive) return null;
    
    await this.checkLockout(user);

    // Si llegó hasta aquí con findByPin, el PIN es correcto (ya que pin es único y se usó para buscarlo).
    // NOTA: Si hubiera una manera de buscar el usuario sin el PIN (ej: por usuario) y luego validar el PIN, 
    // ahí registraríamos el intento fallido. Pero como el POS manda solo el PIN y no sabemos QUIÉN es hasta 
    // que el PIN coincide, si no coincide no podemos sumar intento a nadie. 
    // Para resolver esto asumiendo el flujo de "login by pin" del cajero: 
    // El frontend ya hace lockout temporal.
    
    await this.handleSuccessfulAttempt(user);
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

    // Generar token JWT seguro con el ID del usuario
    const token = this.jwtService.sign({ sub: user.id, tokenVersion: user.tokenVersion });
    const resetLink = `http://localhost:5173/#/reset-password?token=${token}`;

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #D32F2F; padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">Pizza To Go</h1>
        </div>
        <div style="padding: 30px; background-color: #ffffff; color: #333333;">
          <h2 style="margin-top: 0; color: #1a1a1a;">Recuperación de Contraseña</h2>
          <p style="font-size: 16px; line-height: 1.5;">Hola <strong>${user.firstName}</strong>,</p>
          <p style="font-size: 16px; line-height: 1.5;">Hemos recibido una solicitud para restablecer la contraseña de tu cuenta de administrador en el sistema <strong>Pizza To Go</strong>.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetLink}" style="background-color: #D32F2F; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px; display: inline-block;">Restablecer Contraseña</a>
          </div>
          <p style="font-size: 14px; color: #666666; line-height: 1.5;">Si el botón no funciona, copia y pega el siguiente enlace en tu navegador:</p>
          <p style="font-size: 14px; color: #1976d2; word-break: break-all;">${resetLink}</p>
          <hr style="border: none; border-top: 1px solid #eeeeee; margin: 30px 0;" />
          <p style="font-size: 12px; color: #999999; text-align: center;">Si no solicitaste este cambio, puedes ignorar este correo de forma segura. Tu cuenta seguirá protegida.</p>
        </div>
        <div style="background-color: #f5f5f5; padding: 15px; text-align: center; color: #888888; font-size: 12px;">
          &copy; ${new Date().getFullYear()} Pizza To Go - Sistema de Facturación
        </div>
      </div>
    `;

    try {
      await this.mailerService.sendMail({
        to: user.email,
        subject: 'Recuperación de Contraseña - Pizza To Go',
        text: `Hola ${user.firstName},\n\nPara restablecer tu contraseña, copia este enlace en tu navegador:\n${resetLink}\n\nSi no solicitaste esto, ignora este mensaje.`,
        html: emailHtml,
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
}
