import {
  DEFAULT_SERVICE_SLA_CONFIG,
  normalizeServiceSlaConfig,
} from './service-sla.config';

describe('normalizeServiceSlaConfig', () => {
  it('usa los valores operativos predeterminados', () => {
    expect(normalizeServiceSlaConfig(undefined)).toEqual(
      DEFAULT_SERVICE_SLA_CONFIG,
    );
  });

  it('mantiene el límite crítico por encima del aviso', () => {
    expect(
      normalizeServiceSlaConfig({
        kitchenWarningMinutes: 20,
        kitchenCriticalMinutes: 10,
        deliveryMaxMinutes: 35,
        deliveryAlertsEnabled: true,
      }),
    ).toEqual({
      kitchenWarningMinutes: 20,
      kitchenCriticalMinutes: 21,
      deliveryMaxMinutes: 35,
      deliveryAlertsEnabled: true,
    });
  });
});
