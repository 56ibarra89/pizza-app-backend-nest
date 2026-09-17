import {
  DEFAULT_VOID_WASTE_POLICY_CONFIG,
  normalizeVoidWastePolicyConfig,
} from './void-waste-policy.config';

describe('normalizeVoidWastePolicyConfig', () => {
  it('uses secure defaults when no configuration exists', () => {
    const result = normalizeVoidWastePolicyConfig(undefined);

    expect(result.requireSupervisorForPaidOrders).toBe(true);
    expect(result.requireSupervisorWhenPreparationStarted).toBe(true);
    expect(result.reasons).toEqual(DEFAULT_VOID_WASTE_POLICY_CONFIG.reasons);
  });

  it('removes invalid and duplicate reasons while normalizing categories', () => {
    const result = normalizeVoidWastePolicyConfig({
      requireSupervisorForPaidOrders: false,
      reasons: [
        {
          id: 'custom',
          label: '  Motivo válido  ',
          category: 'KITCHEN',
          isActive: true,
          countsAsWaste: true,
          requiresSupervisor: false,
        },
        { id: 'custom', label: 'Duplicado', category: 'OTHER' },
        { id: '', label: 'Inválido', category: 'OTHER' },
      ],
    });

    expect(result.requireSupervisorForPaidOrders).toBe(false);
    expect(result.reasons).toEqual([
      {
        id: 'custom',
        label: 'Motivo válido',
        category: 'KITCHEN',
        isActive: true,
        countsAsWaste: true,
        requiresSupervisor: false,
      },
    ]);
  });
});
