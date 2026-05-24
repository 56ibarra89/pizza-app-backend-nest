import type { OrderEntity } from '../entities/order.entity';
import type { CartItemEntity } from '../entities/order-item.entity';
import type { OrderStatusDto } from '../dto/order-status.dto';
import type { OrderTypeDto } from '../dto/order-type.dto';
import type { PaymentMethodDto } from '../dto/payment-method.dto';
import type { KitchenStatusDto } from '../dto/kitchen-status.dto';

export const ORDERS_REPOSITORY = Symbol('ORDERS_REPOSITORY');

export interface IOrdersRepository {
  listTodayOrActive(now: Date): Promise<OrderEntity[]>;
  listAll(): Promise<OrderEntity[]>;
  findById(id: string): Promise<OrderEntity | null>;

  create(data: {
    id?: string;
    shiftId?: string;
    customerId?: string;
    items: CartItemEntity[];
    subTotal?: number;
    discountAmount?: number;
    taxAmount?: number;
    total: number;
    status: OrderStatusDto;
    timestamp: Date;
    customerName?: string;
    customerAddress?: string;
    orderType?: OrderTypeDto;
    tableId?: string;
    promotionCode?: string;
    paymentMethod?: PaymentMethodDto;
    splitAmounts?: { efectivo: number; tarjeta: number };
    cashierId?: string;
    cashierName?: string;
    isSentToKitchen?: boolean;
    linkedTables?: string[];
  }): Promise<OrderEntity>;

  update(id: string, data: {
    items?: CartItemEntity[];
    subTotal?: number | null;
    discountAmount?: number | null;
    taxAmount?: number | null;
    total?: number;
    status?: OrderStatusDto;
    shiftId?: string | null;
    customerId?: string | null;
    customerName?: string | null;
    customerAddress?: string | null;
    orderType?: OrderTypeDto | null;
    tableId?: string | null;
    promotionCode?: string | null;
    paymentMethod?: PaymentMethodDto | null;
    splitAmounts?: { efectivo: number; tarjeta: number } | null;
    cashierId?: string | null;
    cashierName?: string | null;
    isSentToKitchen?: boolean;
    linkedTables?: string[];
  }): Promise<OrderEntity>;

  updateItemsKitchenStatus(params: {
    orderId: string;
    sentAt: Date;
    kitchenStatus: KitchenStatusDto;
  }): Promise<void>;
}
