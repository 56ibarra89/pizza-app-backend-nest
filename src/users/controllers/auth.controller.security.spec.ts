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
});
