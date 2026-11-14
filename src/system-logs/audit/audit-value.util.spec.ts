import { toAuditJson } from './audit-value.util';

describe('toAuditJson', () => {
  it('redacta campos sensibles compuestos en camelCase, snake_case y kebab-case', () => {
    const sanitized = toAuditJson({
      adminPin: '1234',
      authorizationPin: '9999',
      currentPassword: 'old-password',
      newPassword: 'new-password',
      refresh_token: 'rt-secret',
      'x-api-secret': 'top-secret',
      accessToken: 'at-secret',
      creditCard: '4111-1111-1111-1111',
      cardNumber: '4111111111111111',
      PINHash: 'hash',
      pinLookup: 'lookup',
      nested: {
        secretKey: 'nested-secret',
        cookies: 'session=abc',
      },
    }) as Record<string, unknown>;

    expect(sanitized.adminPin).toBe('[PROTEGIDO]');
    expect(sanitized.authorizationPin).toBe('[PROTEGIDO]');
    expect(sanitized.currentPassword).toBe('[PROTEGIDO]');
    expect(sanitized.newPassword).toBe('[PROTEGIDO]');
    expect(sanitized.refresh_token).toBe('[PROTEGIDO]');
    expect(sanitized['x-api-secret']).toBe('[PROTEGIDO]');
    expect(sanitized.accessToken).toBe('[PROTEGIDO]');
    expect(sanitized.creditCard).toBe('[PROTEGIDO]');
    expect(sanitized.cardNumber).toBe('[PROTEGIDO]');
    expect(sanitized.PINHash).toBe('[PROTEGIDO]');
    expect(sanitized.pinLookup).toBe('[PROTEGIDO]');
    expect(sanitized.nested).toEqual({
      secretKey: '[PROTEGIDO]',
      cookies: '[PROTEGIDO]',
    });
  });

  it('no redacta palabras comunes que contienen subcadenas como pin', () => {
    const sanitized = toAuditJson({
      topping: 'Pepperoni',
      shippingAddress: 'Managua Centro',
      printerId: 'kitchen-1',
      shoppingCartId: 'cart-1',
      opinion: 'Excelente',
    }) as Record<string, unknown>;

    expect(sanitized).toEqual({
      topping: 'Pepperoni',
      shippingAddress: 'Managua Centro',
      printerId: 'kitchen-1',
      shoppingCartId: 'cart-1',
      opinion: 'Excelente',
    });
  });
});
