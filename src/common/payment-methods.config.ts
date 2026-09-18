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
  methods: [
    {
      id: 'cash-nio',
      name: 'Efectivo Córdobas',
      type: 'CASH',
      currency: 'NIO',
      requiresReference: false,
      commissionRate: 0,
      isActive: true,
    },
    {
      id: 'cash-usd',
      name: 'Efectivo Dólares',
      type: 'CASH',
      currency: 'USD',
      requiresReference: false,
      commissionRate: 0,
      isActive: true,
    },
    {
      id: 'card-generic',
      name: 'POS Tarjeta',
      type: 'CARD_POS',
      currency: 'NIO',
      requiresReference: true,
      commissionRate: 2.5,
      isActive: true,
    },
    {
      id: 'transfer-generic',
      name: 'Transferencia bancaria',
      type: 'BANK_TRANSFER',
      currency: 'NIO',
      requiresReference: true,
      commissionRate: 0,
      isActive: true,
    },
  ],
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const clampRate = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(100, Math.max(0, Math.round(parsed * 1000) / 1000));
};

export function normalizePaymentMethodsConfig(
  value: unknown,
): PaymentMethodsConfig {
  const record = isRecord(value) ? value : {};
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
        currency,
        requiresReference:
          typeof candidate.requiresReference === 'boolean'
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
    methods: unique.length
      ? unique
      : DEFAULT_PAYMENT_METHODS_CONFIG.methods.map((method) => ({ ...method })),
  };
}
