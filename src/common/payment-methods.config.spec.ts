import {
  DEFAULT_PAYMENT_METHODS_CONFIG,
  isValidPosReference,
  normalizePaymentMethodsConfig,
  resolveOperationalPaymentMethods,
} from './payment-methods.config';

describe('normalizePaymentMethodsConfig', () => {
  it('habilita efectivo USD solo con multimoneda activa y tasa válida', () => {
    const base = normalizePaymentMethodsConfig(undefined);
    const enabled = { enableSecondaryCurrency: true, secondaryCurrencyCode: 'USD', exchangeRate: 36.5 };
    expect(resolveOperationalPaymentMethods(base, enabled).methods.map((m) => m.id)).toEqual(['cash-nio', 'cash-usd']);
    expect(resolveOperationalPaymentMethods(base, { ...enabled, exchangeRate: 0 }).methods.map((m) => m.id)).toEqual(['cash-nio']);
    expect(resolveOperationalPaymentMethods(base, { ...enabled, enableSecondaryCurrency: false }).methods.map((m) => m.id)).toEqual(['cash-nio']);
    const disabled = { ...resolveOperationalPaymentMethods(base, enabled).methods[1], isActive: false };
    expect(resolveOperationalPaymentMethods({ methods: [...base.methods, disabled] }, enabled).methods[1].isActive).toBe(false);
  });
  it('habilita únicamente efectivo en córdobas si no existe configuración', () => {
    const result = normalizePaymentMethodsConfig(undefined);

    expect(result.methods).toEqual(DEFAULT_PAYMENT_METHODS_CONFIG.methods);
    expect(result.methods).toEqual([{ id: 'cash-nio', name: 'Efectivo Córdobas', type: 'CASH', currency: 'NIO', requiresReference: false, commissionRate: 0, isActive: true }]);
    expect(normalizePaymentMethodsConfig({}).methods).toEqual(result.methods);
    expect(normalizePaymentMethodsConfig({ methods: [] }).methods).toEqual([]);
    expect(normalizePaymentMethodsConfig({ methods: [{ ...result.methods[0], isActive: false }] }).methods[0].isActive).toBe(false);
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
