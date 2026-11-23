import { NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { NotificationsController } from '../controllers/notifications.controller';
import { NotificationsService } from './notifications.service';
import type { SystemLogsService } from '../../system-logs/services/system-logs.service';

describe('NotificationsService', () => {
  const notification = {
    createManyAndReturn: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
  };
  const user = { findUnique: jest.fn() };
  const appConfig = { findUnique: jest.fn() };
  const order = {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    updateMany: jest.fn<Promise<{ count: number }>, [unknown]>(),
  };
  const transaction = jest.fn();
  const prisma = {
    notification,
    user,
    appConfig,
    order,
    $transaction: transaction,
  };
  const systemLogs = { createProcess: jest.fn().mockResolvedValue({ id: 1 }) };

  let service: NotificationsService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new NotificationsService(
      prisma as unknown as PrismaService,
      systemLogs as unknown as SystemLogsService,
    );
    systemLogs.createProcess.mockResolvedValue({ id: 1 });
    transaction.mockImplementation((callback: (tx: typeof prisma) => unknown) =>
      callback(prisma),
    );
    notification.createManyAndReturn.mockImplementation(
      ({ data }: { data: Array<Record<string, unknown>> }) =>
        Promise.resolve(
          data.map((record, index) => ({
            id: `notification-${index}`,
            createdAt: new Date(),
            isRead: false,
            ...record,
          })),
        ),
    );
  });

  it('notifica solamente al motorizado seleccionado en el delivery', async () => {
    order.findUnique.mockResolvedValue({
      orderType: 'DELIVERY',
      driver: { username: 'reina', role: UserRole.MOTORIZADO, isActive: true },
    });

    await service.handleOrderReadyEvent({
      orderId: 'ORD-1',
      isFullOrder: true,
      customerName: 'Cliente',
    });

    const { data } = notification.createManyAndReturn.mock.calls[0][0];
    expect(data).toHaveLength(4);
    expect(data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: UserRole.CAJERO_PRINCIPAL }),
        expect.objectContaining({ role: UserRole.ADMIN }),
        expect.objectContaining({ role: UserRole.DESPACHADOR }),
        {
          title: '¡Orden Lista!',
          message: 'La orden de Cliente está lista para ser entregada.',
          role: UserRole.MOTORIZADO,
          targetUsername: 'reina',
          orderId: 'ORD-1',
        },
      ]),
    );
  });

  it('dirige la notificación de MESERO al mesero asignado o relevado vigente', async () => {
    order.findUnique.mockResolvedValue({
      orderType: 'LOCAL',
      cashierSnapshotName: 'nombre-anterior',
      cashier: { username: 'cajero1', role: UserRole.CAJERO, isActive: true },
      waiter: { username: 'bea', role: UserRole.MESERO, isActive: true },
    });

    await service.handleOrderReadyEvent({
      orderId: 'ORD-MESA-1',
      isFullOrder: true,
      tableName: 'F1-M1',
    });

    expect(user.findUnique).not.toHaveBeenCalled();
    expect(notification.createManyAndReturn).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          role: UserRole.CAJERO,
          targetUsername: 'cajero1',
          orderId: 'ORD-MESA-1',
        }),
        expect.objectContaining({
          role: UserRole.MESERO,
          targetUsername: 'bea',
          orderId: 'ORD-MESA-1',
        }),
      ]),
    });
  });

  it('entrega la alerta al cajero del turno abierto y excluye a otros cajeros del stream', async () => {
    order.findUnique.mockResolvedValue({
      orderType: 'LOCAL',
      cashier: {
        username: 'principal',
        role: UserRole.CAJERO_PRINCIPAL,
        isActive: false,
      },
      shift: {
        status: 'OPEN',
        cashier: { username: 'turno', role: UserRole.CAJERO, isActive: true },
      },
    });
    const controller = new NotificationsController(service);
    const assigned = jest.fn();
    const unrelated = jest.fn();
    user.findUnique
      .mockResolvedValueOnce({
        username: 'turno',
        role: UserRole.CAJERO,
        isActive: true,
      })
      .mockResolvedValueOnce({
        username: 'otro',
        role: UserRole.CAJERO,
        isActive: true,
      });
    const assignedStream = controller
      .stream({
        id: 'cashier-assigned',
        username: 'turno',
        role: 'cajero' as never,
      })
      .subscribe(assigned);
    const unrelatedStream = controller
      .stream({
        id: 'cashier-other',
        username: 'otro',
        role: 'cajero' as never,
      })
      .subscribe(unrelated);

    await service.handleOrderReadyEvent({
      orderId: 'order-shift',
      isFullOrder: true,
    });
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(assigned).toHaveBeenCalledWith({
      data: expect.objectContaining({
        targetUsername: 'turno',
        orderId: 'order-shift',
      }),
    });
    expect(unrelated).not.toHaveBeenCalled();
    const { data } = notification.createManyAndReturn.mock.calls[0][0];
    expect(data).toHaveLength(3);
    expect(
      data.filter(({ role }: { role: UserRole }) => role === UserRole.ADMIN),
    ).toHaveLength(1);
    assignedStream.unsubscribe();
    unrelatedStream.unsubscribe();
  });

  it('consulta las notificaciones del motorizado por usuario exacto', async () => {
    notification.findMany.mockResolvedValue([]);

    await service.getRecentForRole(UserRole.MOTORIZADO, 'reina');

    expect(notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          role: UserRole.MOTORIZADO,
          targetUsername: 'reina',
        },
      }),
    );
  });

  it('impide modificar una notificación ajena', async () => {
    notification.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.markAsReadForUser(
        'notification-other-driver',
        UserRole.MOTORIZADO,
        'reina',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(notification.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'notification-other-driver',
        role: UserRole.MOTORIZADO,
        OR: [{ targetUsername: 'reina' }, { targetUsername: 'reina' }],
      },
      data: { isRead: true },
    });
  });

  it.each([
    ['99990000', '99990000'],
    [null, '88887777'],
  ])(
    'genera una alerta por delivery fuera del SLA con el contacto de la orden (%s)',
    async (snapshot, expectedPhone) => {
      appConfig.findUnique.mockResolvedValue({
        data: {
          deliveryAlertsEnabled: true,
          deliveryMaxMinutes: 35,
        },
      });
      order.findMany.mockResolvedValue([
        {
          id: 'order-overdue',
          invoiceNumber: 'F-100',
          customerSnapshotName: 'Ana',
          cashierSnapshotName: 'Caja1',
          customerPhoneSnapshot: snapshot,
          deliveryStartedAt: new Date(Date.now() - 40 * 60 * 1000),
          customer: { phone: '88887777' },
        },
      ]);
      user.findUnique.mockResolvedValue({
        username: 'caja1',
        role: UserRole.CAJERO,
        isActive: true,
      });
      order.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValue({ count: 0 });

      await service.checkOverdueDeliveries();
      await service.checkOverdueDeliveries();

      const updateCall = order.updateMany.mock.calls[0]?.[0] as {
        where: { id: string; deliverySlaAlertedAt: null };
        data: { deliverySlaAlertedAt: Date };
      };
      expect(updateCall.where).toMatchObject({
        id: 'order-overdue',
        deliverySlaAlertedAt: null,
        deliveredAt: null,
        status: { notIn: ['DELIVERED', 'PAID', 'CANCELLED'] },
      });
      expect(updateCall.data.deliverySlaAlertedAt).toBeInstanceOf(Date);
      expect(transaction).toHaveBeenCalledTimes(2);
      expect(notification.createManyAndReturn).toHaveBeenCalledTimes(1);
      const { data } = notification.createManyAndReturn.mock.calls[0][0];
      expect(data).toHaveLength(4);
      expect(data).toContainEqual(
        expect.objectContaining({
          title: 'Delivery fuera de tiempo',
          message: expect.stringContaining(`Teléfono: ${expectedPhone}.`),
          role: UserRole.CAJERO,
          targetUsername: 'caja1',
          orderId: 'order-overdue',
        }),
      );
      if (snapshot) {
        expect(data).not.toContainEqual(
          expect.objectContaining({
            message: expect.stringContaining('Teléfono: 88887777.'),
          }),
        );
      }
      expect(systemLogs.createProcess).toHaveBeenCalledWith(
        expect.objectContaining({
          process: 'DELIVERY_SLA_MONITOR',
          entity: 'delivery-alert',
        }),
      );
      expect(systemLogs.createProcess).toHaveBeenCalledTimes(1);
    },
  );

  it('invalida suscriptores SSE cuando el token expira, el usuario se desactiva o cambia tokenVersion (H10)', async () => {
    const expiredResult = await service.validateStreamSubscriber({
      id: 'user-1',
      username: 'caja1',
      role: 'cajero' as never,
      tokenVersion: 2,
      tokenExpiresAtMs: Date.now() - 1_000,
    });
    expect(expiredResult).toBeNull();
    expect(user.findUnique).not.toHaveBeenCalled();

    user.findUnique.mockResolvedValueOnce({
      isActive: true,
      tokenVersion: 3,
      role: UserRole.CAJERO,
      username: 'caja1',
    });
    const revokedResult = await service.validateStreamSubscriber({
      id: 'user-1',
      username: 'caja1',
      role: 'cajero' as never,
      tokenVersion: 2,
      tokenExpiresAtMs: Date.now() + 60_000,
    });
    expect(revokedResult).toBeNull();

    user.findUnique.mockResolvedValueOnce({
      isActive: true,
      tokenVersion: 2,
      role: UserRole.CAJERO,
      username: 'caja1',
    });
    const activeResult = await service.validateStreamSubscriber({
      id: 'user-1',
      username: 'caja1',
      role: 'cajero' as never,
      tokenVersion: 2,
      tokenExpiresAtMs: Date.now() + 60_000,
    });
    expect(activeResult).toEqual({
      role: UserRole.CAJERO,
      username: 'caja1',
    });

    const cachedResult = await service.validateStreamSubscriber({
      id: 'user-1',
      username: 'caja1',
      role: 'cajero' as never,
      tokenVersion: 2,
      tokenExpiresAtMs: Date.now() + 60_000,
    });
    expect(cachedResult).toEqual({
      role: UserRole.CAJERO,
      username: 'caja1',
    });
    expect(user.findUnique).toHaveBeenCalledTimes(2);

    service.handleSecuritySocketsRevalidate({ userId: 'user-1' });
    user.findUnique.mockResolvedValueOnce({
      isActive: false,
      tokenVersion: 2,
      role: UserRole.CAJERO,
      username: 'caja1',
    });
    const invalidatedResult = await service.validateStreamSubscriber({
      id: 'user-1',
      username: 'caja1',
      role: 'cajero' as never,
      tokenVersion: 2,
      tokenExpiresAtMs: Date.now() + 60_000,
    });
    expect(invalidatedResult).toBeNull();
    expect(user.findUnique).toHaveBeenCalledTimes(3);
  });
});
