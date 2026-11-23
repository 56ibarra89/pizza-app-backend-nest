const OPERATION_FIELDS: Readonly<
  Record<string, readonly string[] | undefined>
> = {
  waiter: ['waiterId', 'waiterSnapshotName'],
  tables: ['linkedTables'],
  'start-delivery': ['driverId', 'deliveryStartedAt', 'deliveredAt'],
  status: [
    'kitchenReadyAt',
    'deliveryStartedAt',
    'deliveredAt',
    'isSentToKitchen',
  ],
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function operationalOrderAuditFields(
  command: string | undefined,
  requestBody: unknown,
): readonly string[] | undefined {
  if (!command) return undefined;
  const requestedStatus = asRecord(requestBody)?.status;
  if (
    command === 'status' &&
    (requestedStatus === 'paid' || requestedStatus === 'cancelled')
  ) {
    return undefined;
  }
  return Object.hasOwn(OPERATION_FIELDS, command)
    ? OPERATION_FIELDS[command]
    : undefined;
}

export function compactOrderAuditSnapshot(
  value: unknown,
  fields: readonly string[] | undefined,
  command: string | undefined,
  requestBody: unknown,
): unknown {
  const order = asRecord(value);
  if (!fields || !order) return value;

  const summary = Object.fromEntries(
    ['id', 'status', 'updatedAt', 'total', ...fields]
      .filter((field) => order[field] !== undefined)
      .map((field) => [field, order[field]]),
  );
  if (typeof summary.status === 'string') {
    summary.status = summary.status.toLowerCase();
  }
  if (Array.isArray(summary.linkedTables)) {
    summary.linkedTables = summary.linkedTables.map(
      (table: unknown) => asRecord(table)?.tableId ?? table,
    );
  }
  if (command === 'status' && Array.isArray(order.items)) {
    const { itemId, kitchenId } = asRecord(requestBody) ?? {};
    summary.items = order.items.flatMap((entry: unknown) => {
      const item = asRecord(entry);
      if (!item || (itemId !== undefined && item.id !== itemId)) return [];
      const comboSelections = Array.isArray(item.comboSelections)
        ? item.comboSelections.flatMap((entry: unknown) => {
            const selection = asRecord(entry);
            if (
              !selection ||
              (kitchenId && selection.kitchenId !== kitchenId)
            ) {
              return [];
            }
            return [
              {
                groupId: selection.groupId,
                productId: selection.productId,
                kitchenId: selection.kitchenId,
                kitchenStatus: selection.kitchenStatus,
              },
            ];
          })
        : undefined;
      return [
        {
          id: item.id,
          kitchenStatus: item.kitchenStatus,
          isSentToKitchen: item.isSentToKitchen,
          sentAt: item.sentAt,
          ...(comboSelections?.length ? { comboSelections } : {}),
        },
      ];
    });
  }
  return summary;
}
