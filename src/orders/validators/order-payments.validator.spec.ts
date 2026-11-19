import { BadRequestException } from '@nestjs/common';
import { PaymentMethodDto } from '../dto/payment-method.dto';
import { normalizeAndValidateOrderPayments } from './order-payments.validator';
import { normalizePaymentMethodsConfig } from '../../common/payment-methods.config';

describe('normalizeAndValidateOrderPayments', () => {
  it('acepta efectivo NIO sin configuración de métodos ni tasa de cambio', () => {
    const methods = normalizePaymentMethodsConfig(undefined).methods;
    const [payment] = normalizeAndValidateOrderPayments(
      [{ method: PaymentMethodDto.EFECTIVO, methodConfigId: 'cash-nio', amount: 100 }],
      methods,
    );
    expect(payment).toMatchObject({ currency: 'NIO', exchangeRate: 1, commissionAmount: 0 });
  });
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
      36.5,
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
        36.5,
      ),
    ).toThrow(BadRequestException);
  });

  it('exige una tasa configurada aunque el cliente envíe una', () => {
    const payments = [{ method: PaymentMethodDto.EFECTIVO, methodConfigId: 'cash-usd', amount: 100, exchangeRate: 36.5 }];
    expect(() => normalizeAndValidateOrderPayments(payments, [usdCashMethod] as never)).toThrow('Configura una tasa');
    expect(() => normalizeAndValidateOrderPayments(payments, [usdCashMethod] as never, 37)).toThrow('La tasa de cambio cambió');
  });

  it('permite pagos en córdobas sin configurar una tasa', () => {
    const nio = { ...usdCashMethod, id: 'cash-nio', currency: 'NIO' };
    const [payment] = normalizeAndValidateOrderPayments([{ method: PaymentMethodDto.EFECTIVO, methodConfigId: 'cash-nio', amount: 100 }], [nio] as never);
    expect(payment.exchangeRate).toBe(1);
  });
});
