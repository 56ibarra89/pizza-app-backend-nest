import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { UserRoleDto } from '../../common';
import type { KitchensService } from '../../kitchens/kitchens.service';
import type { OrdersService } from '../services/orders.service';
import { OrdersController } from './orders.controller';

describe('OrdersController delivery access', () => {
  const listByDriverAndDate = jest.fn().mockResolvedValue([]);
  const orders = { listByDriverAndDate } as unknown as OrdersService;
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
