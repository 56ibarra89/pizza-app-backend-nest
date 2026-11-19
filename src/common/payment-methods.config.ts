export const PAYMENT_METHODS_CONFIG_ID = 'payment_methods';

export const PAYMENT_METHOD_TYPES = [
  'CASH',
  'CARD_POS',
  'BANK_TRANSFER',
  'DIGITAL_WALLET',
] as const;
export const PAYMENT_CURRENCIES = ['NIO', 'USD'] as const;

export type PaymentMethodType = (typeof PAYMENT_METHOD_TYPES)[number];
export type PaymentCurrency = (typeof PAYMENT_CURRENCIES)[number];

export const POS_REFERENCE_MIN_LENGTH = 4;
export const POS_REFERENCE_MAX_LENGTH = 20;
const POS_REFERENCE_PATTERN = /^(?=.*\d)[A-Z0-9-]{4,20}$/;

export const normalizePosReference = (value: string) =>
  value.trim().toUpperCase();

export const isValidPosReference = (value: string) =>
  POS_REFERENCE_PATTERN.test(normalizePosReference(value));

export interface PaymentMethodConfig {
  id: string;
  name: string;
  type: PaymentMethodType;
  currency: PaymentCurrency;
  requiresReference: boolean;
  commissionRate: number;
  isActive: boolean;
}

export interface PaymentMethodsConfig {
  methods: PaymentMethodConfig[];
}

export const DEFAULT_PAYMENT_METHODS_CONFIG: PaymentMethodsConfig = {
  methods: [{
    id: 'cash-nio',
    name: 'Efectivo Córdobas',
    type: 'CASH',
    currency: 'NIO',
    requiresReference: false,
    commissionRate: 0,
    isActive: true,
  }],
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function resolveOperationalPaymentMethods(
  config: PaymentMethodsConfig,
  general: unknown,
): PaymentMethodsConfig {
  const settings = isRecord(general) ? general : {};
  const code = typeof settings.secondaryCurrencyCode === 'string'
    ? settings.secondaryCurrencyCode.toUpperCase()
    : settings.secondaryCurrencyCode === undefined ? 'USD' : '';
  const rate = Number(settings.exchangeRate);
  const enabled = settings.enableSecondaryCurrency === true && code === 'USD' && Number.isFinite(rate) && rate > 0;
  if (!enabled) return { methods: config.methods.filter((method) => method.currency !== 'USD') };
  if (config.methods.some((method) => (method.type === 'CASH' && method.currency === 'USD') || method.id === 'cash-usd')) return config;
  return { methods: [...config.methods, { id: 'cash-usd', name: 'Efectivo Dólares', type: 'CASH', currency: 'USD', requiresReference: false, commissionRate: 0, isActive: true }] };
}

const clampRate = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(100, Math.max(0, Math.round(parsed * 1000) / 1000));
};

export function normalizePaymentMethodsConfig(
  value: unknown,
): PaymentMethodsConfig {
  const record = isRecord(value) ? value : {};
  if (value == null || (isRecord(value) && Object.keys(value).length === 0)) {
    return { methods: DEFAULT_PAYMENT_METHODS_CONFIG.methods.map((method) => ({ ...method })) };
  }
  const source = Array.isArray(record.methods) ? record.methods : [];
  const methods = source.flatMap((candidate) => {
    if (!isRecord(candidate)) return [];
    const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
    const name =
      typeof candidate.name === 'string' ? candidate.name.trim() : '';
    if (!id || !name) return [];
    const type = PAYMENT_METHOD_TYPES.includes(
      candidate.type as PaymentMethodType,
    )
      ? (candidate.type as PaymentMethodType)
      : 'BANK_TRANSFER';
    const currency = PAYMENT_CURRENCIES.includes(
      candidate.currency as PaymentCurrency,
    )
      ? (candidate.currency as PaymentCurrency)
      : 'NIO';
    return [
      {
        id: id.slice(0, 80),
        name: name.slice(0, 120),
        type,
        currency: type === 'CARD_POS' ? 'NIO' : currency,
        requiresReference:
          type === 'CARD_POS'
            ? true
            : typeof candidate.requiresReference === 'boolean'
              ? candidate.requiresReference
              : false,
        commissionRate: clampRate(candidate.commissionRate),
        isActive:
          typeof candidate.isActive === 'boolean' ? candidate.isActive : true,
      },
    ];
  });
  const unique = methods.filter(
    (method, index) =>
      methods.findIndex((candidate) => candidate.id === method.id) === index,
  );
  return {
    methods: unique,
  };
}
