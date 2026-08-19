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
  const prisma = { notification, user, appConfig };

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
    expect(notification.create).toHaveBeenCalledTimes(5);
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
        targetUsername: 'reina',
      },
      data: { isRead: true },
    });
  });
});
