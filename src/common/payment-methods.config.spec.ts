import {
  DEFAULT_PAYMENT_METHODS_CONFIG,
  isValidPosReference,
  normalizePaymentMethodsConfig,
} from './payment-methods.config';

describe('normalizePaymentMethodsConfig', () => {
  it('returns secure operational defaults', () => {
    const result = normalizePaymentMethodsConfig(undefined);

    expect(result.methods).toEqual(DEFAULT_PAYMENT_METHODS_CONFIG.methods);
    expect(
      result.methods.find((method) => method.type === 'CARD_POS')
        ?.requiresReference,
    ).toBe(true);
  });

  it('normalizes rates and removes duplicate identifiers', () => {
    const result = normalizePaymentMethodsConfig({
      methods: [
        {
          id: 'bac-pos',
          name: ' BAC POS ',
          type: 'CARD_POS',
          currency: 'NIO',
          commissionRate: 2.5555,
          requiresReference: true,
          isActive: true,
        },
        { id: 'bac-pos', name: 'Duplicado' },
      ],
    });

    expect(result.methods).toEqual([
      {
        id: 'bac-pos',
        name: 'BAC POS',
        type: 'CARD_POS',
        currency: 'NIO',
        commissionRate: 2.556,
        requiresReference: true,
        isActive: true,
      },
    ]);
  });

  it('forces card POS methods to córdobas with a required reference', () => {
    const result = normalizePaymentMethodsConfig({
      methods: [
        {
          id: 'pos-usd',
          name: 'POS mal configurado',
          type: 'CARD_POS',
          currency: 'USD',
          commissionRate: 0,
          requiresReference: false,
          isActive: true,
        },
      ],
    });

    expect(result.methods[0]).toMatchObject({
      type: 'CARD_POS',
      currency: 'NIO',
      requiresReference: true,
    });
  });

  it('accepts voucher references and rejects free-form text', () => {
    expect(isValidPosReference('123456')).toBe(true);
    expect(isValidPosReference('a12b34')).toBe(true);
    expect(isValidPosReference('ABC-123456')).toBe(true);
    expect(isValidPosReference('sinreferencia')).toBe(false);
    expect(isValidPosReference('123')).toBe(false);
    expect(isValidPosReference('1234 5678')).toBe(false);
  });
});
