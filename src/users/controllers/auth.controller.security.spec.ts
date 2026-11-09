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
      refreshToken: jest.fn(() =>
        Promise.resolve({ access_token: 'new-token' }),
      ),
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

  it('accepts expired access token or refresh token from Authorization header or body on /auth/refresh (H09)', async () => {
    const users = {
      refreshSessionToken: jest.fn(() =>
        Promise.resolve({
          access_token: 'fresh-access-token',
          refresh_token: 'fresh-refresh-token',
        }),
      ),
    };
    const controller = new AuthController(users as any);

    const resultFromHeader = await controller.refresh(
      undefined,
      {
        headers: { authorization: 'Bearer expired.jwt.token' },
      } as any,
      {},
    );

    expect(users.refreshSessionToken).toHaveBeenCalledWith('expired.jwt.token');
    expect(resultFromHeader).toEqual({
      access_token: 'fresh-access-token',
      refresh_token: 'fresh-refresh-token',
    });

    const resultFromBody = await controller.refresh(
      undefined,
      { headers: {} } as any,
      { refresh_token: 'body.refresh.token' },
    );

    expect(users.refreshSessionToken).toHaveBeenCalledWith(
      'body.refresh.token',
    );
    expect(resultFromBody).toEqual({
      access_token: 'fresh-access-token',
      refresh_token: 'fresh-refresh-token',
    });
  });
});
