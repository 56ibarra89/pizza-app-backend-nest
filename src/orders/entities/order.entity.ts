import type { OrderStatusDto } from '../dto/order-status.dto';
import type { OrderTypeDto } from '../dto/order-type.dto';
import type { PaymentMethodDto } from '../dto/payment-method.dto';
import type { CartItemEntity } from './order-item.entity';
import type { DocumentType } from '@prisma/client';

export interface PaymentEntity {
  id: number;
  method: PaymentMethodDto;
  amount: number;
  reference?: string;
  cashierId?: string;
  cashierSnapshotName?: string;
  createdAt: Date;
}

export interface OrderEntity {
  id: string;
  items: CartItemEntity[];
  payments: PaymentEntity[];
  subTotal?: number;
  discountAmount?: number;
  taxAmount?: number;
  total: number;
  status: OrderStatusDto;
  timestamp: Date;

  customerSnapshotName?: string;
  customerAddress?: string;
  orderType?: OrderTypeDto;
  driverId?: string;
  cuponId?: number;

  cashierSnapshotName?: string;
  customerTendered?: number;
  deliveryChange?: number;
  isSentToKitchen?: boolean;
  linkedTables?: string[];

  cancelReason?: string;
  cancelledById?: string;
  cancelledAt?: Date;

  invoice?: {
    correlativoId: string;
    documentType: DocumentType;
    resolutionNumber: string;
    prefix: string;
    issuedNumber: number;
    invoiceNumber: string;
    issuedAt: Date;
  };
}
