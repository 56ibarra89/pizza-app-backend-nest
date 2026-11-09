import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { UserRoleDto } from '../../common';
import { getBusinessDayBounds } from '../../common/time/business-time.util';
import type { KitchensService } from '../../kitchens/kitchens.service';
import type { OrdersService } from '../services/orders.service';
import { OrdersController } from './orders.controller';

describe('OrdersController delivery and kitchen access', () => {
  const listTodayOrActive = jest.fn().mockResolvedValue([]);
  const listByDriverAndDate = jest.fn().mockResolvedValue([]);
  const listHistory = jest.fn().mockResolvedValue({
    items: [],
    total: 125,
    paymentMethodOptions: [],
  });
  const orders = {
    listTodayOrActive,
    listByDriverAndDate,
    listHistory,
  } as unknown as OrdersService;
  const kitchens = {} as KitchensService;
  const controller = new OrdersController(orders, kitchens);

  const user = (id: string, role: UserRoleDto): AuthenticatedUser => ({
    id,
    username: `${role}-${id}`,
    role,
    permissions: ['delivery.read', 'orders.read'],
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

  it('fuerza al motorizado a consultar únicamente sus propias órdenes usando la zona horaria comercial (H08, H25)', async () => {
    const expectedBounds = getBusinessDayBounds('2026-10-11');
    await controller.getDriverTodayOrders(
      'otro-motorizado',
      user('motorizado-actual', UserRoleDto.motorizado),
      '2026-10-11',
    );

    expect(listByDriverAndDate).toHaveBeenCalledWith(
      'motorizado-actual',
      expectedBounds.startOfDay,
      expectedBounds.endOfDay,
    );
  });

  it.each([
    UserRoleDto.admin,
    UserRoleDto.cajero,
    UserRoleDto.cajero_principal,
    UserRoleDto.despachador,
  ])('permite al rol %s consultar al motorizado solicitado', async (role) => {
    const expectedBounds = getBusinessDayBounds('2026-10-11');
    await controller.getDriverTodayOrders(
      'motorizado-solicitado',
      user(`usuario-${role}`, role),
      '2026-10-11',
    );

    expect(listByDriverAndDate).toHaveBeenCalledWith(
      'motorizado-solicitado',
      expectedBounds.startOfDay,
      expectedBounds.endOfDay,
    );
  });

  it('delega filtros de motorizado y cocina a SQL en listTodayOrActive (H23)', async () => {
    const getAssignedKitchenIdForDate = jest
      .fn()
      .mockResolvedValueOnce('kitchen-main')
      .mockResolvedValueOnce(null);
    const controllerWithKitchen = new OrdersController(orders, {
      getAssignedKitchenIdForDate,
    } as unknown as KitchensService);

    await controllerWithKitchen.list(
      undefined,
      undefined,
      undefined,
      user('driver-1', UserRoleDto.motorizado),
    );
    expect(listTodayOrActive).toHaveBeenLastCalledWith(
      expect.any(Date),
      expect.objectContaining({
        driverId: 'driver-1',
        kitchenId: undefined,
      }),
    );

    await controllerWithKitchen.list(
      undefined,
      undefined,
      undefined,
      user('cook-1', UserRoleDto.cocinero),
    );
    expect(listTodayOrActive).toHaveBeenLastCalledWith(
      expect.any(Date),
      expect.objectContaining({
        driverId: undefined,
        kitchenId: 'kitchen-main',
      }),
    );

    listTodayOrActive.mockClear();
    const unassignedResult = await controllerWithKitchen.list(
      undefined,
      undefined,
      undefined,
      user('cook-unassigned', UserRoleDto.cocinero),
    );
    expect(unassignedResult).toEqual([]);
    expect(listTodayOrActive).not.toHaveBeenCalled();
  });

  it('restringe listHistory al motorizado autenticado y filtra cocina asignada para cocineros (H08)', async () => {
    const getAssignedKitchenIdForDate = jest
      .fn()
      .mockResolvedValueOnce('kitchen-1')
      .mockResolvedValueOnce(null);
    const controllerWithKitchen = new OrdersController(orders, {
      getAssignedKitchenIdForDate,
    } as unknown as KitchensService);

    await controllerWithKitchen.listHistory(
      {
        startDate: '2026-10-01T00:00:00.000Z',
        endDate: '2026-10-12T23:59:59.999Z',
        page: 1,
        pageSize: 20,
      },
      user('driver-99', UserRoleDto.motorizado),
    );
    expect(listHistory).toHaveBeenLastCalledWith(
      expect.objectContaining({
        driverId: 'driver-99',
        kitchenId: undefined,
      }),
    );

    await controllerWithKitchen.listHistory(
      {
        startDate: '2026-10-01T00:00:00.000Z',
        endDate: '2026-10-12T23:59:59.999Z',
        page: 1,
        pageSize: 20,
      },
      user('cook-1', UserRoleDto.cocinero),
    );
    expect(listHistory).toHaveBeenLastCalledWith(
      expect.objectContaining({
        driverId: undefined,
        kitchenId: 'kitchen-1',
      }),
    );

    const unassignedCookResult = await controllerWithKitchen.listHistory(
      {
        startDate: '2026-10-01T00:00:00.000Z',
        endDate: '2026-10-12T23:59:59.999Z',
        page: 1,
        pageSize: 20,
      },
      user('cook-unassigned', UserRoleDto.cocinero),
    );
    expect(unassignedCookResult.items).toEqual([]);
    expect(unassignedCookResult.total).toBe(0);
  });
});
