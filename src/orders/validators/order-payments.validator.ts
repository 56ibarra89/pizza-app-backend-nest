import { BadRequestException } from '@nestjs/common';

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
