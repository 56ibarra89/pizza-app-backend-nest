import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
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
        'Se requiere un PIN autorizado para cancelar la orden.',
      );
    }

    const user = await this.usersRepository.findByPin(adminPin, {
      requiredPermissions: ['orders.cancel.authorize'],
      attemptScope: 'order-cancellation',
    });
    if (!user) {
      throw new ForbiddenException(
        'PIN inválido o el usuario no tiene permiso para autorizar cancelaciones.',
      );
    }

    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
    };
  }
}
