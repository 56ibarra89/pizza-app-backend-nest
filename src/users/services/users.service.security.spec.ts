import { UnauthorizedException } from '@nestjs/common';
import { UserRoleDto } from '../dto/user-role.dto';
import type { UserEntity } from '../entities/user.entity';
import { UsersService } from './users.service';

describe('UsersService security boundaries', () => {
  const user: UserEntity = {
    id: 'user-1',
    username: 'cashier',
    email: 'cashier@example.com',
    firstName: 'Cash',
    lastName: 'User',
    pinHash: 'pin-hash',
    passwordHash: 'password-hash',
    role: UserRoleDto.cajero,
    isActive: true,
    failedLoginAttempts: 0,
    lockoutLevel: 0,
    themePreference: 'light',
    tokenVersion: 7,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const createHarness = () => {
    const repo = {
      findById: jest.fn(() => Promise.resolve(user)),
      findByIdentifier: jest.fn(() => Promise.resolve(user)),
      update: jest.fn((_id, data) => Promise.resolve({ ...user, ...data })),
      registerFailedLoginAttempt: jest.fn(() => Promise.resolve()),
      registerSuccessfulLogin: jest.fn(() => Promise.resolve()),
      incrementTokenVersion: jest.fn(() => Promise.resolve(user)),
    };
    const hasher = {
      hash: jest.fn((value: string) => Promise.resolve(`hash:${value}`)),
      verify: jest.fn(() => Promise.resolve(true)),
    };
    const pinHasher = {
      hash: jest.fn((value: string) => Promise.resolve(`pin-hash:${value}`)),
      lookup: jest.fn((value: string) => `pin-lookup:${value}`),
    };
    const jwtService = {
      sign: jest.fn(() => 'signed-token'),
      verify: jest.fn(() => ({
        sub: user.id,
        tokenVersion: user.tokenVersion,
        type: 'password_reset',
      })),
    };
    const prisma = {
      user: {
        updateMany: jest.fn(() => Promise.resolve({ count: 1 })),
      },
    };
    const authAttempts = {
      assertAllowed: jest.fn(() => Promise.resolve()),
      registerFailure: jest.fn(() => Promise.resolve()),
      registerSuccess: jest.fn(() => Promise.resolve()),
    };
    const lockoutService = {
      assertCanAuthenticate: jest.fn(),
    };
    const service = new UsersService(
      repo as any,
      hasher,
      lockoutService,
      {} as any,
      {} as any,
      jwtService as any,
      prisma as any,
      pinHasher as any,
      authAttempts as any,
      { authorizationForUser: jest.fn() } as any,
    );
    return {
      service,
      repo,
      hasher,
      pinHasher,
      jwtService,
      prisma,
      authAttempts,
      lockoutService,
    };
  };

  it('never accepts administrative fields through self-service updates', async () => {
    const { service, repo } = createHarness();

    await service.updateOwnProfile(user.id, {
      firstName: 'Updated',
      role: UserRoleDto.admin,
      isActive: false,
      workDays: ['MONDAY'],
    } as any);

    const update = repo.update.mock.calls[0][1];
    expect(update.firstName).toBe('Updated');
    expect(update.role).toBeUndefined();
    expect(update.isActive).toBeUndefined();
    expect(update.workDays).toBeUndefined();
  });

  it('requires the current password before changing a PIN', async () => {
    const { service, repo } = createHarness();

    await expect(
      service.updateOwnProfile(user.id, { pin: '123456' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('revokes existing sessions after a verified credential change', async () => {
    const { service, repo, hasher } = createHarness();

    await service.updateOwnProfile(user.id, {
      pin: '123456',
      currentPassword: 'Current1!',
    });

    expect(hasher.verify).toHaveBeenCalledWith('Current1!', user.passwordHash);
    expect(repo.update).toHaveBeenCalledWith(
      user.id,
      expect.objectContaining({ tokenVersion: user.tokenVersion + 1 }),
    );
  });

  it('uses one identifier lookup and persistent source throttling during login', async () => {
    const { service, repo, authAttempts } = createHarness();

    const result = await service.loginWithPassword({
      identifier: 'CASHIER',
      password: 'Current1!',
      source: '127.0.0.1',
    });

    expect(result.success).toBe(true);
    expect(result.access_token).toBe('signed-token');
    expect(result.refresh_token).toBe('signed-token');
    expect(repo.findByIdentifier).toHaveBeenCalledWith('cashier');
    expect(repo.registerSuccessfulLogin).toHaveBeenCalledWith(user.id);
    expect(authAttempts.assertAllowed).toHaveBeenCalledTimes(1);
    expect(authAttempts.registerSuccess).toHaveBeenCalledTimes(1);
  });

  it('atomically consumes a password reset token only once', async () => {
    const { service, prisma } = createHarness();
    prisma.user.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    const results = await Promise.allSettled([
      service.resetPassword('same-token', 'NewPassword1!'),
      service.resetPassword('same-token', 'NewPassword1!'),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    expect(prisma.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: user.id,
          tokenVersion: user.tokenVersion,
        }),
        data: expect.objectContaining({
          tokenVersion: { increment: 1 },
        }),
      }),
    );
  });

  it('renews a session from a recently expired access token or valid refresh token (H09)', async () => {
    const { service, jwtService } = createHarness();
    const recentlyExpiredSec = Math.floor((Date.now() - 5 * 60_000) / 1000);
    jwtService.verify.mockReturnValueOnce({
      sub: user.id,
      tokenVersion: user.tokenVersion,
      type: 'access',
      exp: recentlyExpiredSec,
    });
    jwtService.sign
      .mockReturnValueOnce('new-access-jwt')
      .mockReturnValueOnce('new-refresh-jwt');

    const refreshed = await service.refreshSessionToken('expired-access-token');

    expect(jwtService.verify).toHaveBeenCalledWith('expired-access-token', {
      ignoreExpiration: true,
    });
    expect(refreshed).toEqual({
      access_token: 'new-access-jwt',
      refresh_token: 'new-refresh-jwt',
    });
  });

  it('rejects session renewal when tokenVersion was revoked or token is outside grace window (H09)', async () => {
    const { service, jwtService } = createHarness();

    // Case 1: Revoked tokenVersion
    jwtService.verify.mockReturnValueOnce({
      sub: user.id,
      tokenVersion: user.tokenVersion - 1,
      type: 'refresh',
      exp: Math.floor((Date.now() + 3600_000) / 1000),
    });

    await expect(
      service.refreshSessionToken('revoked-refresh-token'),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    // Case 2: Access token expired more than 24h ago
    jwtService.verify.mockReturnValueOnce({
      sub: user.id,
      tokenVersion: user.tokenVersion,
      type: 'access',
      exp: Math.floor((Date.now() - 25 * 3600_000) / 1000),
    });

    await expect(
      service.refreshSessionToken('stale-access-token'),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    // Case 3: Password reset token cannot be used to refresh session
    jwtService.verify.mockReturnValueOnce({
      sub: user.id,
      tokenVersion: user.tokenVersion,
      type: 'password_reset',
      exp: Math.floor((Date.now() + 600_000) / 1000),
    } as any);

    await expect(
      service.refreshSessionToken('reset-token'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
