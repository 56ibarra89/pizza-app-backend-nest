import {
  KitchenStatus as DbKitchenStatus,
  OrderStatus as DbOrderStatus,
  OrderType as DbOrderType,
  PaymentMethod as DbPaymentMethod,
  ProductSize as DbProductSize,
} from '@prisma/client';
import { KitchenStatusDto } from '../dto/kitchen-status.dto';
import { OrderStatusDto } from '../dto/order-status.dto';
import { OrderTypeDto } from '../dto/order-type.dto';
import { PaymentMethodDto } from '../dto/payment-method.dto';
import { ProductSizeDto } from '../dto/product-size.dto';

export function toDbOrderStatus(status: OrderStatusDto): DbOrderStatus {
  switch (status) {
    case OrderStatusDto.pending:
      return DbOrderStatus.PENDING;
    case OrderStatusDto.preparing:
      return DbOrderStatus.PREPARING;
    case OrderStatusDto.ready:
      return DbOrderStatus.READY;
    case OrderStatusDto.delivered:
      return DbOrderStatus.DELIVERED;
    case OrderStatusDto.paid:
      return DbOrderStatus.PAID;
    case OrderStatusDto.cancelled:
      return DbOrderStatus.CANCELLED;
    default:
      throw new Error(`Unsupported OrderStatusDto: ${String(status)}`);
  }
}

export function fromDbOrderStatus(status: DbOrderStatus): OrderStatusDto {
  switch (status) {
    case DbOrderStatus.PENDING:
      return OrderStatusDto.pending;
    case DbOrderStatus.PREPARING:
      return OrderStatusDto.preparing;
    case DbOrderStatus.READY:
      return OrderStatusDto.ready;
    case DbOrderStatus.DELIVERED:
      return OrderStatusDto.delivered;
    case DbOrderStatus.PAID:
      return OrderStatusDto.paid;
    case DbOrderStatus.CANCELLED:
      return OrderStatusDto.cancelled;
    default:
      throw new Error(`Unsupported DbOrderStatus: ${String(status)}`);
  }
}

export function toDbKitchenStatus(status: KitchenStatusDto): DbKitchenStatus {
  switch (status) {
    case KitchenStatusDto.pending:
      return DbKitchenStatus.PENDING;
    case KitchenStatusDto.preparing:
      return DbKitchenStatus.PREPARING;
    case KitchenStatusDto.ready:
      return DbKitchenStatus.READY;
    case KitchenStatusDto.delivered:
      return DbKitchenStatus.DELIVERED;
    default:
      throw new Error(`Unsupported KitchenStatusDto: ${String(status)}`);
  }
}

export function fromDbKitchenStatus(status: DbKitchenStatus): KitchenStatusDto {
  switch (status) {
    case DbKitchenStatus.PENDING:
      return KitchenStatusDto.pending;
    case DbKitchenStatus.PREPARING:
      return KitchenStatusDto.preparing;
    case DbKitchenStatus.READY:
      return KitchenStatusDto.ready;
    case DbKitchenStatus.DELIVERED:
      return KitchenStatusDto.delivered;
    default:
      throw new Error(`Unsupported DbKitchenStatus: ${String(status)}`);
  }
}

export function toDbOrderType(type: OrderTypeDto): DbOrderType {
  switch (type) {
    case OrderTypeDto.local:
      return DbOrderType.LOCAL;
    case OrderTypeDto.llevar:
      return DbOrderType.LLEVAR;
    case OrderTypeDto.delivery:
      return DbOrderType.DELIVERY;
    default:
      throw new Error(`Unsupported OrderTypeDto: ${String(type)}`);
  }
}

export function fromDbOrderType(type: DbOrderType): OrderTypeDto {
  switch (type) {
    case DbOrderType.LOCAL:
      return OrderTypeDto.local;
    case DbOrderType.LLEVAR:
      return OrderTypeDto.llevar;
    case DbOrderType.DELIVERY:
      return OrderTypeDto.delivery;
    default:
      throw new Error(`Unsupported DbOrderType: ${String(type)}`);
  }
}

export function toDbPaymentMethod(method: PaymentMethodDto): DbPaymentMethod {
  switch (method) {
    case PaymentMethodDto.EFECTIVO:
      return DbPaymentMethod.EFECTIVO;
    case PaymentMethodDto.TARJETA:
      return DbPaymentMethod.TARJETA;
    case PaymentMethodDto.APP:
      return DbPaymentMethod.APP;
    case PaymentMethodDto.MIXTO:
      return DbPaymentMethod.MIXTO;
    default:
      throw new Error(`Unsupported PaymentMethodDto: ${String(method)}`);
  }
}

export function fromDbPaymentMethod(method: DbPaymentMethod): PaymentMethodDto {
  switch (method) {
    case DbPaymentMethod.EFECTIVO:
      return PaymentMethodDto.EFECTIVO;
    case DbPaymentMethod.TARJETA:
      return PaymentMethodDto.TARJETA;
    case DbPaymentMethod.APP:
      return PaymentMethodDto.APP;
    case DbPaymentMethod.MIXTO:
      return PaymentMethodDto.MIXTO;
    default:
      throw new Error(`Unsupported DbPaymentMethod: ${String(method)}`);
  }
}

export function toDbSize(size: ProductSizeDto): DbProductSize {
  switch (size) {
    case ProductSizeDto.familiar:
      return DbProductSize.FAMILIAR;
    case ProductSizeDto.mediana:
      return DbProductSize.MEDIANA;
    case ProductSizeDto.personal:
      return DbProductSize.PERSONAL;
    case ProductSizeDto.unico:
      return DbProductSize.UNICO;
    default:
      throw new Error(`Unsupported ProductSizeDto: ${String(size)}`);
  }
}

export function fromDbSize(size: DbProductSize): ProductSizeDto {
  switch (size) {
    case DbProductSize.FAMILIAR:
      return ProductSizeDto.familiar;
    case DbProductSize.MEDIANA:
      return ProductSizeDto.mediana;
    case DbProductSize.PERSONAL:
      return ProductSizeDto.personal;
    case DbProductSize.UNICO:
      return ProductSizeDto.unico;
    default:
      throw new Error(`Unsupported DbProductSize: ${String(size)}`);
  }
}
