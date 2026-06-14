import type { KitchenStatusDto } from '../dto/kitchen-status.dto';

export interface SelectedExtraEntity {
  name: string;
  price: number;
}

export interface CartItemEntity {
  productId?: string;
  name: string;
  price: number;
  size: string;
  quantity: number;
  extras: SelectedExtraEntity[];
  note?: string;
  giftQuantity: number;
  giftReason?: string;
  isSentToKitchen?: boolean;
  sentAt?: number;
  kitchenStatus?: KitchenStatusDto;
}
