import type { Prisma } from '@prisma/client';

const SENSITIVE_KEYS = new Set([
  'authorization',
  'cookie',
  'password',
  'passwordhash',
  'pin',
  'pinhash',
  'pinlookup',
  'secret',
  'token',
  'access_token',
  'refreshtoken',
  'creditcard',
  'cardnumber',
  'cvv',
]);
const MAX_DEPTH = 6;
const MAX_ARRAY_ITEMS = 100;
const MAX_JSON_LENGTH = 30_000;

function isSensitiveKey(key: string): boolean {
  const normalized = key.replace(/[-_]/g, '').toLowerCase();
  return [...SENSITIVE_KEYS].some(
    (sensitive) => normalized === sensitive.replace(/[-_]/g, ''),
  );
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
