import { AuthController } from './auth.controller';
import { UserRoleDto } from '../dto/user-role.dto';

describe('AuthController session revocation', () => {
  it('revokes server-side sessions during a normal logout', async () => {
    const users = { revokeAllTokens: jest.fn(() => Promise.resolve()) };
    const controller = new AuthController(users as any);

    await controller.logout({
      id: 'user-1',
      username: 'cashier',
      role: UserRoleDto.cajero,
    });

    expect(users.revokeAllTokens).toHaveBeenCalledWith('user-1');
  });

  it('delegates refresh token requests to UsersService', async () => {
    const users = {
      refreshToken: jest.fn(() => Promise.resolve({ access_token: 'new-token' })),
    };
    const controller = new AuthController(users as any);

    const result = await controller.refresh({
      id: 'user-1',
      username: 'cashier',
      role: UserRoleDto.cajero,
    });

    expect(users.refreshToken).toHaveBeenCalledWith('user-1');
    expect(result).toEqual({ access_token: 'new-token' });
  });
});

