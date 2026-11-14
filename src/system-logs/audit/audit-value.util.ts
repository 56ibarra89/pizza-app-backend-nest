import type { Prisma } from '@prisma/client';

const SENSITIVE_TOKEN_KEYS = new Set([
  'authorization',
  'cookie',
  'cookies',
  'passcode',
  'passphrase',
  'password',
  'passwords',
  'pin',
  'pins',
  'secret',
  'secrets',
  'token',
  'tokens',
  'cvv',
  'cvc',
]);

const SENSITIVE_COMPOUND_KEYS = new Set([
  'passwordhash',
  'pinhash',
  'pinlookup',
  'accesstoken',
  'refreshtoken',
  'creditcard',
  'cardnumber',
  'apikey',
]);

const MAX_DEPTH = 6;
const MAX_ARRAY_ITEMS = 100;
const MAX_JSON_LENGTH = 30_000;

function isSensitiveKey(key: string): boolean {
  const normalized = key.replace(/[-_]/g, '').toLowerCase();
  if (SENSITIVE_COMPOUND_KEYS.has(normalized)) {
    return true;
  }

  const tokens = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

  return tokens.some((token) => SENSITIVE_TOKEN_KEYS.has(token));
}

function sanitize(value: unknown, depth: number): unknown {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value.slice(0, 4_000);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (depth >= MAX_DEPTH) return '[PROFUNDIDAD_LIMITADA]';

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => sanitize(item, depth + 1));
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        isSensitiveKey(key) ? '[PROTEGIDO]' : sanitize(item, depth + 1),
      ]),
    );
  }

  if (typeof value === 'symbol') return value.description ?? 'Symbol';
  return '[VALOR_NO_SERIALIZABLE]';
}

export function toAuditJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  const sanitized = sanitize(value, 0);
  const serialized = JSON.stringify(sanitized);

  if (serialized.length <= MAX_JSON_LENGTH) {
    return sanitized as Prisma.InputJsonValue;
  }

  return {
    truncated: true,
    originalLength: serialized.length,
    preview: serialized.slice(0, MAX_JSON_LENGTH),
  };
}
