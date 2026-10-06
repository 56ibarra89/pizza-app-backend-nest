import type { KitchenStatusDto } from '../dto/kitchen-status.dto';

export interface SelectedExtraEntity {
  name: string;
  price: number;
}

export type KitchenModifierKindEntity =
  | 'REMOVE'
  | 'ADD'
  | 'PREPARATION'
  | 'SERVICE';

export interface KitchenModifierSelectionEntity {
  id: string;
  label: string;
  kind: KitchenModifierKindEntity;
}

export interface SelectedComboOptionEntity {
  groupId: string;
  groupName: string;
  productId: string;
  productName: string;
  size?: string;
  quantity: number;
  extraPrice: number;
  extras?: SelectedExtraEntity[];
  kitchenId?: string;
  categoryId?: string;
  categoryName?: string;
  kitchenStatus?: KitchenStatusDto;
}

export interface CartItemEntity {
  id?: number;
  productId?: string;
  categoryId?: string;
  name: string;
  price: number;
  size: string;
  quantity: number;
  extras: SelectedExtraEntity[];
  note?: string;
  kitchenModifiers?: KitchenModifierSelectionEntity[];
  giftQuantity: number;
  giftReason?: string;
  isSentToKitchen?: boolean;
  sentAt?: number;
  kitchenStatus?: KitchenStatusDto;
  kitchenId?: string;
  isCombo?: boolean;
  comboSelections?: SelectedComboOptionEntity[];
}
