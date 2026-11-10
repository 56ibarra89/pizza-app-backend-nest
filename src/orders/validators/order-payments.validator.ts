import { BadRequestException } from '@nestjs/common';
import {
  isValidPosReference,
  normalizePosReference,
  type PaymentMethodConfig,
} from '../../common/payment-methods.config';
import type { OrderPaymentDto } from '../dto/order-payment.dto';
import { PaymentMethodDto } from '../dto/payment-method.dto';

interface PaymentAmount {
  amount: number;
}

export function assertPaymentsMatchTotal(
  expectedTotal: number,
  payments: readonly PaymentAmount[],
): void {
  const paidTotal = payments.reduce((sum, payment) => sum + payment.amount, 0);

  if (Math.abs(paidTotal - expectedTotal) > 0.01) {
    throw new BadRequestException(
      `La suma de los pagos (${paidTotal.toFixed(2)}) no coincide con el total de la orden (${expectedTotal.toFixed(2)}). No se puede marcar como pagada.`,
    );
  }
}

export function reconcileSplitOrderPayments(
  payments: OrderPaymentDto[],
  targetTotal: number,
  clientTotal?: number,
): OrderPaymentDto[] {
  if (!payments.length) return payments;
  const paidSum = payments.reduce((sum, p) => sum + p.amount, 0);
  if (clientTotal !== undefined && Math.abs(paidSum - clientTotal) >= 0.02) {
    return payments;
  }
  const delta = Number((targetTotal - paidSum).toFixed(2));
  if (Math.abs(delta) < 0.01 || Math.abs(delta) > 0.01) {
    return payments;
  }
  const adjustIdx = [...payments]
    .map((payment, idx) => ({ payment, idx }))
    .reverse()
    .find(
      ({ payment }) =>
        payment.method === PaymentMethodDto.EFECTIVO &&
        (!payment.currency || payment.currency === 'NIO') &&
        payment.amount + delta > 0,
    )?.idx;
  if (adjustIdx === undefined) return payments;
  return payments.map((payment, idx) => {
    if (idx !== adjustIdx) return payment;
    const adjustedAmount = Number((payment.amount + delta).toFixed(2));
    return {
      ...payment,
      amount: adjustedAmount,
      ...(payment.originalAmount !== undefined
        ? { originalAmount: adjustedAmount }
        : {}),
    };
  });
}

function findPaymentMethod(
  methods: PaymentMethodConfig[],
  payment: OrderPaymentDto,
) {
  if (payment.methodConfigId) {
    return methods.find((method) => method.id === payment.methodConfigId);
  }
  const expectedType =
    payment.method === PaymentMethodDto.EFECTIVO
      ? 'CASH'
      : payment.method === PaymentMethodDto.TARJETA
        ? 'CARD_POS'
        : undefined;
  return methods.find(
    (method) =>
      method.isActive &&
      (expectedType
        ? method.type === expectedType
        : method.type === 'BANK_TRANSFER' || method.type === 'DIGITAL_WALLET'),
  );
}

function toLegacyPaymentMethod(method: PaymentMethodConfig): PaymentMethodDto {
  if (method.type === 'CASH') return PaymentMethodDto.EFECTIVO;
  if (method.type === 'CARD_POS') return PaymentMethodDto.TARJETA;
  return PaymentMethodDto.APP;
}

export function normalizeAndValidateOrderPayments(
  payments: OrderPaymentDto[],
  methods: PaymentMethodConfig[],
  defaultExchangeRate = 36.5,
): OrderPaymentDto[] {
  return payments.map((payment) => {
    const configured = findPaymentMethod(methods, payment);
    if (!configured || !configured.isActive) {
      throw new BadRequestException(
        'El método de pago seleccionado ya no está disponible.',
      );
    }
    const rawReference = payment.reference?.trim();
    const reference =
      configured.type === 'CARD_POS' && rawReference
        ? normalizePosReference(rawReference)
        : rawReference;
    if (
      configured.type === 'CARD_POS' &&
      !isValidPosReference(reference ?? '')
    ) {
      throw new BadRequestException(
        `${configured.name} requiere el código de autorización o referencia del voucher: 4 a 20 caracteres alfanuméricos o guiones, con al menos un número.`,
      );
    }
    if (
      configured.type !== 'CARD_POS' &&
      configured.requiresReference &&
      (!reference || reference.length < 4)
    ) {
      throw new BadRequestException(
        `${configured.name} requiere una referencia de al menos 4 caracteres.`,
      );
    }
    const amount = Math.round(payment.amount * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException(
        'El monto de cada pago debe ser mayor a cero.',
      );
    }
    const commissionAmount =
      Math.round(amount * configured.commissionRate) / 100;
    const providedExchangeRate = Number(payment.exchangeRate);
    if (
      configured.currency !== 'USD' &&
      payment.exchangeRate !== undefined &&
      Number.isFinite(providedExchangeRate) &&
      Math.abs(providedExchangeRate - 1) > 0.0001
    ) {
      throw new BadRequestException(
        'Los pagos en córdobas deben tener tipo de cambio igual a 1.',
      );
    }
    const exchangeRate =
      configured.currency === 'USD'
        ? providedExchangeRate > 0
          ? providedExchangeRate
          : Math.max(0.0001, Number(defaultExchangeRate) || 36.5)
        : 1;
    const providedOriginalAmount = Number(payment.originalAmount);
    if (
      payment.originalAmount !== undefined &&
      (!Number.isFinite(providedOriginalAmount) || providedOriginalAmount <= 0)
    ) {
      throw new BadRequestException(
        'El monto original del pago debe ser mayor a cero.',
      );
    }
    const originalAmount =
      providedOriginalAmount > 0
        ? Math.round(providedOriginalAmount * 10000) / 10000
        : Math.round((amount / exchangeRate) * 10000) / 10000;

    if (configured.currency !== 'USD') {
      if (Math.abs(originalAmount - amount) > 0.01) {
        throw new BadRequestException(
          'El monto original del pago no coincide con el importe registrado en córdobas.',
        );
      }
    } else if (providedOriginalAmount > 0) {
      const expectedNioAmount =
        Math.round(originalAmount * exchangeRate * 100) / 100;
      if (Math.abs(expectedNioAmount - amount) > 0.01) {
        throw new BadRequestException(
          'El monto en córdobas no es coherente con el monto original en dólares y el tipo de cambio aplicado.',
        );
      }
    }

    return {
      ...payment,
      method: toLegacyPaymentMethod(configured),
      methodConfigId: configured.id,
      reference,
      methodSnapshotName: configured.name,
      methodType: configured.type,
      currency: configured.currency,
      originalAmount,
      exchangeRate,
      commissionRate: configured.commissionRate,
      commissionAmount,
    };
  });
}
