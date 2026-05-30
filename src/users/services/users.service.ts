import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
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

  delete(id: string) {
    return this.repo.delete(id);
  }

  async loginWithPassword(params: {
    identifier: string;
    password: string;
  }): Promise<{ success: boolean; role?: UserRoleDto; email?: string }> {
    const idLower = params.identifier.toLowerCase();

    const user =
      (await this.repo.findByUsername(idLower)) ??
      (await this.repo.findByEmail(idLower));

    if (!user || !user.isActive) return { success: false };
    if (!user.passwordHash) return { success: false };

    const ok = await this.hasher.verify(params.password, user.passwordHash);
    if (!ok) return { success: false };

    await this.repo.update(user.id, { lastVisit: new Date() });
    return { success: true, role: user.role, email: user.email };
  }

  async loginWithPin(pin: string): Promise<{ username: string; role: UserRoleDto } | null> {
    const user = await this.repo.findByPin(pin);
    if (!user || !user.isActive) return null;
    await this.repo.update(user.id, { lastVisit: new Date() });
    return { username: user.username, role: user.role };
  }

  async requireValidPin(pin: string): Promise<{ username: string; role: UserRoleDto }> {
    const result = await this.loginWithPin(pin);
    if (!result) throw new UnauthorizedException('PIN inválido');
    return result;
  }
}
