export const SERVICE_SLA_CONFIG_ID = 'service_slas';

export interface ServiceSlaConfig {
  kitchenWarningMinutes: number;
  kitchenCriticalMinutes: number;
  deliveryMaxMinutes: number;
  deliveryAlertsEnabled: boolean;
}

export const DEFAULT_SERVICE_SLA_CONFIG: ServiceSlaConfig = {
  kitchenWarningMinutes: 12,
  kitchenCriticalMinutes: 18,
  deliveryMaxMinutes: 35,
  deliveryAlertsEnabled: true,
};

function boundedInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(numeric)));
}

export function normalizeServiceSlaConfig(value: unknown): ServiceSlaConfig {
  const raw =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  const warning = boundedInteger(
    raw.kitchenWarningMinutes,
    DEFAULT_SERVICE_SLA_CONFIG.kitchenWarningMinutes,
    1,
    240,
  );
  const criticalCandidate = boundedInteger(
    raw.kitchenCriticalMinutes,
    DEFAULT_SERVICE_SLA_CONFIG.kitchenCriticalMinutes,
    2,
    360,
  );

  return {
    kitchenWarningMinutes: warning,
    kitchenCriticalMinutes: Math.max(warning + 1, criticalCandidate),
    deliveryMaxMinutes: boundedInteger(
      raw.deliveryMaxMinutes,
      DEFAULT_SERVICE_SLA_CONFIG.deliveryMaxMinutes,
      5,
      720,
    ),
    deliveryAlertsEnabled:
      typeof raw.deliveryAlertsEnabled === 'boolean'
        ? raw.deliveryAlertsEnabled
        : DEFAULT_SERVICE_SLA_CONFIG.deliveryAlertsEnabled,
  };
}
