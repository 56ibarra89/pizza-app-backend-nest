import {
  isPackagingOrderItem,
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

  it('keeps products as kitchen work', () => {
    expect(requiresKitchenPreparation({ name: 'Pizza familiar' })).toBe(true);
  });
});
