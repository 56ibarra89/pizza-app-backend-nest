import {
  DEFAULT_PAYMENT_METHODS_CONFIG,
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
});
