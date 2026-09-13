import { HttpException } from '@nestjs/common';
import { PinAttemptService } from './pin-attempt.service';

describe('PinAttemptService', () => {
  const createHarness = () => {
    const prisma = {
      authAttempt: {
        findFirst: jest.fn(() => Promise.resolve(null)),
        findMany: jest.fn(() =>
          Promise.resolve([{ lockedUntil: new Date(Date.now() + 2_000) }]),
        ),
        deleteMany: jest.fn(() => Promise.resolve({ count: 1 })),
      },
      $executeRaw: jest.fn(() => Promise.resolve(1)),
      $transaction: jest.fn((queries: Promise<unknown>[]) =>
        Promise.all(queries),
      ),
    };
    return {
      service: new PinAttemptService(prisma as any),
      prisma,
    };
  };

  it('checks persistent database scopes before authentication', async () => {
    const { service, prisma } = createHarness();

    await service.assertAllowed(['pin:terminal-a', 'pin:terminal-a']);

    expect(prisma.authAttempt.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ key: { in: ['pin:terminal-a'] } }),
      }),
    );
  });

  it('rejects a scope that is still locked', async () => {
    const { service, prisma } = createHarness();
    prisma.authAttempt.findFirst.mockResolvedValue({
      key: 'pin:terminal-a',
      lockedUntil: new Date(Date.now() + 5_000),
    });

    try {
      await service.assertAllowed('pin:terminal-a');
      throw new Error('Expected a lockout error');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getResponse()).toEqual(
        expect.objectContaining({ retryAfterSeconds: 5 }),
      );
    }
  });

  it('returns the server countdown after a progressive PIN failure', async () => {
    const { service, prisma } = createHarness();

    const lockout = await service.registerPinFailure('pin:terminal-a');

    expect(lockout.retryAfterSeconds).toBe(2);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(prisma.authAttempt.findMany).toHaveBeenCalledWith({
      where: { key: { in: ['pin:terminal-a'] } },
      select: { lockedUntil: true },
    });
  });

  it('persists failures and clears successful scopes', async () => {
    const { service, prisma } = createHarness();

    await service.registerFailure('pin:terminal-a');
    await service.registerSuccess('pin:terminal-a');

    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.authAttempt.deleteMany).toHaveBeenCalledWith({
      where: { key: { in: ['pin:terminal-a'] } },
    });
  });
});
