import type { OrderStatusDto } from '../dto/order-status.dto';
import type { OrderTypeDto } from '../dto/order-type.dto';
import type { PaymentMethodDto } from '../dto/payment-method.dto';
import type { CartItemEntity } from './order-item.entity';
import type { DocumentType } from '@prisma/client';

export interface OrderEntity {
  id: string;
  items: CartItemEntity[];
  subTotal?: number;
  taxAmount?: number;
  total: number;
  status: OrderStatusDto;
  timestamp: Date;

  customerName?: string;
  customerAddress?: string;
  orderType?: OrderTypeDto;
  tableId?: string;
  paymentMethod?: PaymentMethodDto;
  splitAmounts?: { efectivo: number; tarjeta: number };
  cashierName?: string;
  isSentToKitchen?: boolean;
  linkedTables?: string[];

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
