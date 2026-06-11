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
  listByDateRange(startDate: Date, endDate: Date): Promise<OrderEntity[]>;
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
    customerSnapshotName?: string;
    customerAddress?: string;
    orderType?: OrderTypeDto;
    cuponId?: number;
    payments?: { method: PaymentMethodDto; amount: number }[];
    cashierId?: string;
    cashierSnapshotName?: string;
    isSentToKitchen?: boolean;
    linkedTables?: string[];
    driverId?: string;
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
    customerSnapshotName?: string | null;
    customerAddress?: string | null;
    orderType?: OrderTypeDto | null;
    cuponId?: number | null;
    payments?: { method: PaymentMethodDto; amount: number }[] | null;
    cashierId?: string | null;
    cashierSnapshotName?: string | null;
    cancelReason?: string | null;
    cancelledById?: string | null;
    cancelledAt?: Date | null;
    isSentToKitchen?: boolean;
    linkedTables?: string[];
    driverId?: string | null;
  }): Promise<OrderEntity>;

  updateItemsKitchenStatus(params: {
    orderId: string;
    sentAt: Date;
    kitchenStatus: KitchenStatusDto;
  }): Promise<void>;
}
