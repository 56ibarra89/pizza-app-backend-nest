import type { OrderEntity } from '../entities/order.entity';

export const ORDER_SYNCHRONIZED_EVENT = 'order.synchronized';

export type OrderSynchronizationMutation = 'created' | 'updated';

export interface OrderSynchronizedEvent {
  mutation: OrderSynchronizationMutation;
  order: OrderEntity;
}
