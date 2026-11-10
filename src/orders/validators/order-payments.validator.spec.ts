import { BadRequestException } from '@nestjs/common';
import { PaymentMethodDto } from '../dto/payment-method.dto';
import { normalizeAndValidateOrderPayments } from './order-payments.validator';

describe('normalizeAndValidateOrderPayments', () => {
  const usdCashMethod = {
    id: 'cash-usd',
    name: 'Efectivo USD',
    type: 'CASH',
    currency: 'USD',
    isActive: true,
    requiresReference: false,
    commissionRate: 0,
  };

  it('preserva cuatro decimales USD y conserva la tolerancia máxima de C$0.01', () => {
    const [payment] = normalizeAndValidateOrderPayments(
      [
        {
          method: PaymentMethodDto.EFECTIVO,
          methodConfigId: 'cash-usd',
          amount: 100,
          originalAmount: 2.7397,
          exchangeRate: 36.5,
        },
      ],
      [usdCashMethod] as never,
    );

    expect(payment.originalAmount).toBe(2.7397);
    expect(payment.exchangeRate).toBe(36.5);
  });

  it('rechaza un importe USD cuya conversión excede un centavo de córdobas', () => {
    expect(() =>
      normalizeAndValidateOrderPayments(
        [
          {
            method: PaymentMethodDto.EFECTIVO,
            methodConfigId: 'cash-usd',
            amount: 100,
            originalAmount: 2.7,
            exchangeRate: 36.5,
          },
        ],
        [usdCashMethod] as never,
      ),
    ).toThrow(BadRequestException);
  });
});
