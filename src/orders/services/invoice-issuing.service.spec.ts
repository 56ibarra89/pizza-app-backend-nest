import { BadRequestException } from '@nestjs/common';
import { CertificadoStatus, CuponManualStatus, Prisma } from '@prisma/client';
import { InvoiceIssuingService } from './invoice-issuing.service';
import { toOrderResponseDto } from '../mappers/orders.mapper';
import { OrderStatusDto } from '../dto/order-status.dto';

describe('InvoiceIssuingService', () => {
  const totals = {
    subTotal: 100,
    discountAmount: 10,
    taxAmount: 13.5,
    total: 103.5,
  };

  it('consumes promotions when completing a legacy pre-issued invoice', async () => {
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([{ id: 'order-1' }])
      .mockResolvedValueOnce([
        {
          id: 7,
          manualStatus: CuponManualStatus.ACTIVO,
          maxUses: 10,
          currentUses: 1,
          expiresDate: null,
          deletedAt: null,
        },
      ])
      .mockResolvedValueOnce([
        { id: 9, status: CertificadoStatus.DISPONIBLE, deletedAt: null },
      ]);
    let capturedCertUpdate: unknown;
    let capturedOrderUpdate: unknown;
    const tx = {
      $queryRaw: queryRaw,
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'order-1',
          status: 'PENDING',
          cashierId: 'cashier-1',
          cashierSnapshotName: 'Caja',
          shiftId: 'old-shift',
          invoiceNumber: 'FAC-1',
          pendingCertificateSerials: [' gift-1 '],
        }),
        update: jest.fn((args: unknown) => {
          capturedOrderUpdate = args;
          return Promise.resolve({});
        }),
      },
      shift: { findFirst: jest.fn().mockResolvedValue({ id: 'shift-open' }) },
      orderItem: {
        findMany: jest.fn().mockResolvedValue([
          {
            productId: 'product-1',
            name: 'Producto',
            note: 'Vale: GIFT-1',
            giftQuantity: 1,
            price: new Prisma.Decimal(100),
          },
        ]),
      },
      cupon: { update: jest.fn().mockResolvedValue({}) },
      certificado: {
        findUnique: jest.fn().mockResolvedValue({
          amount: null,
          items: [{ productId: 'product-1', quantity: 1 }],
        }),
        update: jest.fn((args: unknown) => {
          capturedCertUpdate = args;
          return Promise.resolve({});
        }),
      },
    };

    await new InvoiceIssuingService().issue(tx as never, {
      orderId: 'order-1',
      dto: {},
      totals,
      promotion: { source: 'coupon', cuponId: 7 },
    });

    expect(tx.cupon.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { currentUses: { increment: 1 } },
    });
    expect(capturedCertUpdate).toMatchObject({
      where: { id: 9 },
      data: {
        status: CertificadoStatus.ENTREGADO,
        redeemedOrderId: 'order-1',
      },
    });
    const orderUpdateArg = capturedOrderUpdate as {
      data: {
        status: string;
        shiftId: string;
        paidAt: unknown;
        pendingCertificateSerials: unknown;
      };
    };
    expect(orderUpdateArg.data).toMatchObject({
      status: 'PAID',
      shiftId: 'shift-open',
      pendingCertificateSerials: Prisma.DbNull,
    });
    expect(orderUpdateArg.data.paidAt).toBeInstanceOf(Date);
  });

  it('rejects collection when no cash-register shift is open', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'order-1' }]),
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'order-1',
          status: 'PENDING',
          cashierId: 'cashier-1',
          cashierSnapshotName: 'Caja',
          shiftId: null,
          invoiceNumber: 'FAC-1',
          pendingCertificateSerials: null,
        }),
        update: jest.fn(),
      },
      shift: { findFirst: jest.fn().mockResolvedValue(null) },
    };

    await expect(
      new InvoiceIssuingService().issue(tx as never, {
        orderId: 'order-1',
        dto: {},
        totals,
        promotion: { source: 'none' },
      }),
    ).rejects.toThrow(BadRequestException);
    expect(tx.order.update).not.toHaveBeenCalled();
  });

  it('does not consume the parent coupon again when issuing a split invoice', async () => {
    let capturedOrderUpdate: unknown;
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ id: 'order-child' }])
        .mockResolvedValueOnce([{ id: 'correlative-1' }]),
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'order-child',
          status: 'PENDING',
          cashierId: 'cashier-1',
          cashierSnapshotName: 'Caja',
          invoiceNumber: null,
          pendingCertificateSerials: null,
        }),
        update: jest.fn((args: unknown) => {
          capturedOrderUpdate = args;
          return Promise.resolve({});
        }),
      },
      shift: { findFirst: jest.fn().mockResolvedValue({ id: 'shift-open' }) },
      cupon: { update: jest.fn().mockResolvedValue({}) },
      correlativo: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'correlative-1',
          prefix: 'T-',
          currentNumber: 1,
          endNumber: 999,
          status: 'ACTIVO',
          resolutionNumber: 'RES-1',
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      systemLog: { create: jest.fn().mockResolvedValue({}) },
    };

    await new InvoiceIssuingService().issue(tx as never, {
      orderId: 'order-child',
      dto: {},
      totals,
      promotion: { source: 'coupon', cuponId: 7 },
      skipCouponConsumption: true,
    });

    expect(tx.cupon.update).not.toHaveBeenCalled();
    expect(capturedOrderUpdate).toMatchObject({
      data: { couponConsumptionRecorded: false },
    });
  });

  it('falls back to pendingCertificateSerials when dto.certificateSerials is empty and persists customerId', async () => {
    const queryRaw = jest
      .fn()
      .mockResolvedValueOnce([{ id: 'order-1' }])
      .mockResolvedValueOnce([
        { id: 12, status: CertificadoStatus.DISPONIBLE, deletedAt: null },
      ]);
    let capturedCertUpdate: unknown;
    let capturedOrderUpdate: unknown;
    const tx = {
      $queryRaw: queryRaw,
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'order-1',
          status: 'PENDING',
          cashierId: 'cashier-1',
          cashierSnapshotName: 'Caja',
          shiftId: 'old-shift',
          invoiceNumber: 'FAC-1',
          pendingCertificateSerials: ['CERT-99'],
        }),
        update: jest.fn((args: unknown) => {
          capturedOrderUpdate = args;
          return Promise.resolve({});
        }),
      },
      shift: { findFirst: jest.fn().mockResolvedValue({ id: 'shift-open' }) },
      orderItem: {
        findMany: jest.fn().mockResolvedValue([
          {
            productId: 'product-1',
            name: 'Producto',
            note: 'Vale: CERT-99',
            giftQuantity: 1,
            price: new Prisma.Decimal(100),
          },
        ]),
      },
      certificado: {
        findUnique: jest.fn().mockResolvedValue({
          amount: null,
          items: [{ productId: 'product-1', quantity: 1 }],
        }),
        update: jest.fn((args: unknown) => {
          capturedCertUpdate = args;
          return Promise.resolve({});
        }),
      },
    };

    await new InvoiceIssuingService().issue(tx as never, {
      orderId: 'order-1',
      dto: {
        certificateSerials: [],
        customerId: 'cust-123',
      },
      totals,
      promotion: { source: 'none' },
    });

    expect(capturedCertUpdate).toMatchObject({
      where: { id: 12 },
      data: {
        status: CertificadoStatus.ENTREGADO,
        redeemedOrderId: 'order-1',
      },
    });
    expect(capturedOrderUpdate).toMatchObject({
      data: {
        customerId: 'cust-123',
        pendingCertificateSerials: Prisma.DbNull,
      },
    });
  });

  it('serializes paidAt and certificateSerials in toOrderResponseDto', () => {
    const paidAt = new Date('2026-10-22T18:30:00.000Z');
    const dto = toOrderResponseDto({
      id: 'order-1',
      items: [],
      payments: [],
      total: 100,
      status: OrderStatusDto.paid,
      timestamp: new Date('2026-10-22T18:00:00.000Z'),
      paidAt,
      certificateSerials: ['CERT-01'],
    });

    expect(dto.paidAt).toBe(paidAt.toISOString());
    expect(dto.certificateSerials).toEqual(['CERT-01']);
  });
});
