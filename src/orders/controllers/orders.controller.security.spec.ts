import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { UserRoleDto } from '../../common';
import type { KitchensService } from '../../kitchens/kitchens.service';
import type { OrdersService } from '../services/orders.service';
import { OrdersController } from './orders.controller';

describe('OrdersController delivery access', () => {
  const listByDriverAndDate = jest.fn().mockResolvedValue([]);
  const listHistory = jest.fn().mockResolvedValue({
    items: [],
    total: 125,
    paymentMethodOptions: [],
  });
  const orders = {
    listByDriverAndDate,
    listHistory,
  } as unknown as OrdersService;
  const kitchens = {} as KitchensService;
  const controller = new OrdersController(orders, kitchens);

  const user = (id: string, role: UserRoleDto): AuthenticatedUser => ({
    id,
    username: `${role}-${id}`,
    role,
    permissions: ['delivery.read'],
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns bounded metadata for historical queries', async () => {
    const result = await controller.listHistory({
      startDate: '2026-10-01T00:00:00.000Z',
      endDate: '2026-10-12T23:59:59.999Z',
      page: 2,
      pageSize: 25,
      view: 'invoices',
    });

    expect(listHistory).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, pageSize: 25, view: 'invoices' }),
    );
    expect(result).toMatchObject({
      items: [],
      total: 125,
      page: 2,
      pageSize: 25,
      totalPages: 5,
    });
  });

  it('fuerza al motorizado a consultar únicamente sus propias órdenes', async () => {
    await controller.getDriverTodayOrders(
      'otro-motorizado',
      user('motorizado-actual', UserRoleDto.motorizado),
      '2026-10-11',
    );

    expect(listByDriverAndDate).toHaveBeenCalledWith(
      'motorizado-actual',
      new Date(2026, 9, 11, 0, 0, 0, 0),
      new Date(2026, 9, 11, 23, 59, 59, 999),
    );
  });

  it.each([UserRoleDto.admin, UserRoleDto.despachador])(
    'permite al rol %s consultar al motorizado solicitado',
    async (role) => {
      await controller.getDriverTodayOrders(
        'motorizado-solicitado',
        user(`usuario-${role}`, role),
        '2026-10-11',
      );

      expect(listByDriverAndDate).toHaveBeenCalledWith(
        'motorizado-solicitado',
        new Date(2026, 9, 11, 0, 0, 0, 0),
        new Date(2026, 9, 11, 23, 59, 59, 999),
      );
    },
  );
});
