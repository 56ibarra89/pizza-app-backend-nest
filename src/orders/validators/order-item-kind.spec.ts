import {
  isPackagingOrderItem,
  isSplitBillCreditOrderItem,
  isSplitBillOrderItem,
  isSplitBillPartialPaymentItem,
  requiresKitchenPreparation,
} from './order-item-kind';

describe('order item kind', () => {
  it('keeps packaging as a billing item but excludes it from kitchen work', () => {
    const packaging = { name: 'Empaque Familiar' };

    expect(isPackagingOrderItem(packaging)).toBe(true);
    expect(requiresKitchenPreparation(packaging)).toBe(false);
  });

  it('excludes delivery charges from kitchen work', () => {
    expect(requiresKitchenPreparation({ name: 'Delivery' })).toBe(false);
  });

  it('excludes split-bill partial payments and credit items from kitchen work', () => {
    const partialPayment = { name: 'Pago parcial (Persona 1)' };
    const creditItem = { name: 'Abono subcuenta (Persona 1)' };

    expect(isSplitBillPartialPaymentItem(partialPayment)).toBe(true);
    expect(isSplitBillOrderItem(partialPayment)).toBe(true);
    expect(requiresKitchenPreparation(partialPayment)).toBe(false);

    expect(isSplitBillCreditOrderItem(creditItem)).toBe(true);
    expect(isSplitBillOrderItem(creditItem)).toBe(true);
    expect(requiresKitchenPreparation(creditItem)).toBe(false);
  });

  it('keeps products as kitchen work', () => {
    expect(requiresKitchenPreparation({ name: 'Pizza familiar' })).toBe(true);
  });
});
