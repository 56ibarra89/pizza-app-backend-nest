import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { UserRoleDto } from '../../users/dto/user-role.dto';
import {
  USERS_REPOSITORY,
  type IUsersRepository,
} from '../../users/interfaces/users.repository';

export interface AuthorizedCancellationAdmin {
  id: string;
  firstName: string;
  lastName: string;
}

@Injectable()
export class OrderCancellationAuthorizationService {
  constructor(
    @Inject(USERS_REPOSITORY)
    private readonly usersRepository: IUsersRepository,
  ) {}

  async authorize(adminPin?: string): Promise<AuthorizedCancellationAdmin> {
    if (!adminPin) {
      throw new ForbiddenException(
        'Se requiere un PIN de administrador para cancelar la orden.',
      );
    }

    const user = await this.usersRepository.findByPin(adminPin);
    if (!user || !user.isActive || user.role !== UserRoleDto.admin) {
      throw new ForbiddenException(
        'PIN de administrador inválido o usuario no tiene permisos.',
      );
    }

    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
    };
  }
}
