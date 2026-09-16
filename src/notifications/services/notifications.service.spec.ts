import { NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  const notification = {
    create: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
  };
  const user = { findUnique: jest.fn() };
  const appConfig = { findUnique: jest.fn() };
  const order = {
    findMany: jest.fn(),
    updateMany: jest.fn(),
    update: jest.fn(),
  };
  const prisma = { notification, user, appConfig, order };

  let service: NotificationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new NotificationsService(prisma as unknown as PrismaService);
    notification.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: 'notification-created',
          createdAt: new Date(),
          isRead: false,
          ...data,
        }),
    );
  });

  it('notifica solamente al motorizado seleccionado en el delivery', async () => {
    user.findUnique.mockResolvedValue({
      username: 'reina',
      role: UserRole.MOTORIZADO,
      isActive: true,
    });

    await service.handleOrderReadyEvent({
      orderId: 'ORD-1',
      isFullOrder: true,
      orderType: 'delivery',
      customerName: 'Cliente',
      driverId: 'driver-reina',
    });

    expect(user.findUnique).toHaveBeenCalledWith({
      where: { id: 'driver-reina' },
      select: { username: true, role: true, isActive: true },
    });
    expect(notification.create).toHaveBeenCalledWith({
      data: {
        title: '¡Orden Lista!',
        message: 'La orden de Cliente está lista para ser entregada.',
        role: UserRole.MOTORIZADO,
        targetUsername: 'reina',
      },
    });
    expect(notification.create).toHaveBeenCalledTimes(6);
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

  it('genera una sola alerta por delivery fuera del SLA', async () => {
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
        cashierSnapshotName: 'caja1',
        deliveryStartedAt: new Date(Date.now() - 40 * 60 * 1000),
        customer: { phone: '88887777' },
      },
    ]);
    order.updateMany.mockResolvedValue({ count: 1 });

    await service.checkOverdueDeliveries();

    expect(order.updateMany).toHaveBeenCalledWith({
      where: { id: 'order-overdue', deliverySlaAlertedAt: null },
      data: { deliverySlaAlertedAt: expect.any(Date) },
    });
    expect(notification.create).toHaveBeenCalledTimes(4);
    expect(notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: 'Delivery fuera de tiempo',
        role: UserRole.CAJERO,
        targetUsername: 'caja1',
      }),
    });
  });
});
