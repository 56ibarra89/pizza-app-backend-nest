import { PinHasherService } from './pin-hasher.service';

describe('PinHasherService', () => {
  const service = new PinHasherService({
    get: (name: string) =>
      name === 'PIN_PEPPER'
        ? 'test-pin-pepper-with-at-least-32-bytes-long'
        : undefined,
  } as any);

  it('stores a salted hash and verifies the original PIN', async () => {
    const hash = await service.hash('123456');

    expect(hash).not.toContain('123456');
    await expect(service.verify('123456', hash)).resolves.toBe(true);
    await expect(service.verify('654321', hash)).resolves.toBe(false);
  });

  it('creates a deterministic peppered lookup without exposing the PIN', () => {
    const first = service.lookup('123456');
    const second = service.lookup('123456');

    expect(first).toBe(second);
    expect(first).not.toContain('123456');
  });
});
