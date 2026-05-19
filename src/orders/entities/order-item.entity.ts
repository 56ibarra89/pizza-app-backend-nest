import type { KitchenStatusDto } from '../dto/kitchen-status.dto';
import type { ProductSizeDto } from '../dto/product-size.dto';

export interface SelectedExtraEntity {
  name: string;
  price: number;
}

export interface CartItemEntity {
  productId?: string;
  name: string;
  price: number;
  size: ProductSizeDto;
  quantity: number;
  extras: SelectedExtraEntity[];
  note?: string;
  giftQuantity?: number;
  isSentToKitchen?: boolean;
  sentAt?: number;
  kitchenStatus?: KitchenStatusDto;
}
