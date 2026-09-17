export const VOID_WASTE_POLICY_CONFIG_ID = 'void_waste_policies';

export const CANCELLATION_CATEGORIES = [
  'KITCHEN',
  'CUSTOMER',
  'SERVICE',
  'COURTESY',
  'OTHER',
] as const;

export type CancellationCategory = (typeof CANCELLATION_CATEGORIES)[number];

export interface CancellationReasonPolicy {
  id: string;
  label: string;
  category: CancellationCategory;
  isActive: boolean;
  countsAsWaste: boolean;
  requiresSupervisor: boolean;
}

export interface VoidWastePolicyConfig {
  requireSupervisorForPaidOrders: boolean;
  requireSupervisorWhenPreparationStarted: boolean;
  reasons: CancellationReasonPolicy[];
}

export const DEFAULT_VOID_WASTE_POLICY_CONFIG: VoidWastePolicyConfig = {
  requireSupervisorForPaidOrders: true,
  requireSupervisorWhenPreparationStarted: true,
  reasons: [
    {
      id: 'pizza-quemada',
      label: 'Pizza quemada en horno',
      category: 'KITCHEN',
      isActive: true,
      countsAsWaste: true,
      requiresSupervisor: true,
    },
    {
      id: 'cliente-cancelo-tardanza',
      label: 'Cliente canceló por tardanza en delivery',
      category: 'CUSTOMER',
      isActive: true,
      countsAsWaste: false,
      requiresSupervisor: false,
    },
    {
      id: 'error-comanda-mesero',
      label: 'Error de comanda del mesero',
      category: 'SERVICE',
      isActive: true,
      countsAsWaste: false,
      requiresSupervisor: false,
    },
    {
      id: 'cortesia-gerencia',
      label: 'Cortesía de la casa / Gerencia',
      category: 'COURTESY',
      isActive: true,
      countsAsWaste: false,
      requiresSupervisor: true,
    },
    {
      id: 'cliente-cambio-opinion',
      label: 'Cliente cambió de opinión',
      category: 'CUSTOMER',
      isActive: true,
      countsAsWaste: false,
      requiresSupervisor: false,
    },
  ],
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asBoolean = (value: unknown, fallback: boolean) =>
  typeof value === 'boolean' ? value : fallback;

export function normalizeVoidWastePolicyConfig(
  value: unknown,
): VoidWastePolicyConfig {
  const record = isObject(value) ? value : {};
  const sourceReasons = Array.isArray(record.reasons) ? record.reasons : [];
  const normalizedReasons = sourceReasons.flatMap((candidate) => {
    if (!isObject(candidate)) return [];
    const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
    const label =
      typeof candidate.label === 'string' ? candidate.label.trim() : '';
    const category = CANCELLATION_CATEGORIES.includes(
      candidate.category as CancellationCategory,
    )
      ? (candidate.category as CancellationCategory)
      : 'OTHER';
    if (!id || !label) return [];
    return [
      {
        id: id.slice(0, 80),
        label: label.slice(0, 160),
        category,
        isActive: asBoolean(candidate.isActive, true),
        countsAsWaste: asBoolean(candidate.countsAsWaste, false),
        requiresSupervisor: asBoolean(candidate.requiresSupervisor, false),
      },
    ];
  });
  const uniqueReasons = normalizedReasons.filter(
    (reason, index, reasons) =>
      reasons.findIndex((candidate) => candidate.id === reason.id) === index,
  );

  return {
    requireSupervisorForPaidOrders: asBoolean(
      record.requireSupervisorForPaidOrders,
      DEFAULT_VOID_WASTE_POLICY_CONFIG.requireSupervisorForPaidOrders,
    ),
    requireSupervisorWhenPreparationStarted: asBoolean(
      record.requireSupervisorWhenPreparationStarted,
      DEFAULT_VOID_WASTE_POLICY_CONFIG.requireSupervisorWhenPreparationStarted,
    ),
    reasons: uniqueReasons.length
      ? uniqueReasons
      : DEFAULT_VOID_WASTE_POLICY_CONFIG.reasons.map((reason) => ({
          ...reason,
        })),
  };
}
