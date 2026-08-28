import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  ActiveCashRegisterDto,
  WaiterPerformanceDto,
  LiveKpisDto,
} from '../dto/admin-dashboard.dto';

const AVATAR_COLORS = [
  '#d32f2f',
  '#1976d2',
  '#2e7d32',
  '#ed6c02',
  '#9c27b0',
  '#009688',
  '#e91e63',
  '#3f51b5',
];

const DAY_MAP = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
] as const;

@Injectable()
export class AdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getActiveCashRegisters(): Promise<ActiveCashRegisterDto[]> {
    const shifts = await this.prisma.shift.findMany({
      where: { status: 'OPEN' },
      include: {
        cashier: true,
        orders: {
          where: { status: 'PAID' },
          include: {
            cashier: true,
            payments: true,
          },
        },
      },
      orderBy: { startTime: 'asc' },
    });

    const result: ActiveCashRegisterDto[] = [];

    for (const shift of shifts) {
      const collaboratorMap = new Map<string, ActiveCashRegisterDto>();

      const principalFullName = shift.cashier
        ? `${shift.cashier.firstName} ${shift.cashier.lastName}`.trim() ||
          shift.cashier.username
        : shift.cashierSnapshotName;

      const principalRole = (
        shift.cashier?.role || 'CAJERO_PRINCIPAL'
      ).toUpperCase();

      const principalKey = shift.cashierId
        ? `user-${shift.cashierId}`
        : `snap-${shift.cashierSnapshotName.toLowerCase()}`;

      // 1. Registrar siempre al Cajero Principal que abrió el turno
      collaboratorMap.set(principalKey, {
        id: shift.id,
        name: shift.cashRegisterSnapshotName || 'Caja Principal',
        cashierId: shift.cashierId || '',
        cashier: principalFullName,
        cashierRole: principalRole,
        startTime: shift.startTime,
        openingAmount: Number(shift.openingAmount) || 0,
        revenueCash: 0,
        revenueCard: 0,
        revenueApp: 0,
        revenueTotal: 0,
        transactionsCompleted: 0,
      });

      // 2. Procesar cada orden cobrada y asignarla al colaborador correspondiente
      for (const order of shift.orders) {
        let orderKey: string;
        if (order.cashierId) {
          orderKey = `user-${order.cashierId}`;
        } else if (order.cashierSnapshotName) {
          orderKey = `snap-${order.cashierSnapshotName.toLowerCase()}`;
        } else {
          orderKey = principalKey;
        }

        if (!collaboratorMap.has(orderKey)) {
          let collaboratorName = 'Cajero';
          let collaboratorRole = 'CAJERO';

          if (order.cashier) {
            collaboratorName =
              `${order.cashier.firstName} ${order.cashier.lastName}`.trim() ||
              order.cashier.username;
            collaboratorRole = (order.cashier.role || 'CAJERO').toUpperCase();
          } else if (order.cashierSnapshotName) {
            collaboratorName = order.cashierSnapshotName;
          }

          const firstName = collaboratorName.split(' ')[0];
          const stationName =
            collaboratorRole === 'DESPACHADOR'
              ? `Despacho Delivery (${firstName})`
              : `Caja ${firstName}`;

          collaboratorMap.set(orderKey, {
            id: `${shift.id}-${order.cashierId || order.cashierSnapshotName || 'collab'}`,
            name: stationName,
            cashierId: order.cashierId || '',
            cashier: collaboratorName,
            cashierRole: collaboratorRole,
            startTime: shift.startTime,
            openingAmount: 0,
            revenueCash: 0,
            revenueCard: 0,
            revenueApp: 0,
            revenueTotal: 0,
            transactionsCompleted: 0,
          });
        }

        const entry = collaboratorMap.get(orderKey)!;
        entry.transactionsCompleted += 1;

        if (order.payments && order.payments.length > 0) {
          order.payments.forEach((payment) => {
            const amount = Number(payment.amount) || 0;
            const method = (payment.method || '').toUpperCase();
            if (method === 'EFECTIVO') entry.revenueCash += amount;
            else if (method === 'TARJETA') entry.revenueCard += amount;
            else if (method === 'APP') entry.revenueApp += amount;
            else entry.revenueCash += amount;
          });
        } else {
          entry.revenueCash += Number(order.total) || 0;
        }
      }

      // 3. Calcular totales y ordenar (Cajero Principal primero, luego por recaudación)
      collaboratorMap.forEach((entry) => {
        entry.revenueTotal =
          entry.revenueCash + entry.revenueCard + entry.revenueApp;
      });

      const principalEntry = collaboratorMap.get(principalKey)!;
      const otherEntries = Array.from(collaboratorMap.values())
        .filter((e) => e !== principalEntry)
        .sort((a, b) => b.revenueTotal - a.revenueTotal);

      result.push(principalEntry, ...otherEntries);
    }

    return result;
  }

  async getWaiterPerformance(): Promise<WaiterPerformanceDto[]> {
    const now = new Date();
    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0,
      0,
      0,
      0,
    );
    const endOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
      999,
    );

    const currentDayEnum = DAY_MAP[now.getDay()];

    const waiters = await this.prisma.user.findMany({
      where: { role: 'MESERO', isActive: true },
      include: {
        waiterZoneAssignments: {
          where: { day: currentDayEnum as any },
        },
      },
    });

    const todayOrders = await this.prisma.order.findMany({
      where: {
        timestamp: { gte: startOfDay, lte: endOfDay },
        status: { not: 'CANCELLED' },
      },
      include: {
        linkedTables: {
          include: { mesa: true },
        },
      },
    });

    const result: WaiterPerformanceDto[] = waiters.map((waiter, index) => {
      const assignedFloors = new Set(
        waiter.waiterZoneAssignments.map((a) => a.floor),
      );

      const waiterOrders = todayOrders.filter((order) =>
        order.linkedTables.some((t) => assignedFloors.has(t.mesa.floor)),
      );

      const ordersServed = waiterOrders.length;
      const revenueTotal = waiterOrders.reduce(
        (acc, curr) => acc + (Number(curr.total) || 0),
        0,
      );

      return {
        id: waiter.id,
        name:
          `${waiter.firstName} ${waiter.lastName}`.trim() || waiter.username,
        ordersServed,
        revenueTotal,
        avatarColor: AVATAR_COLORS[index % AVATAR_COLORS.length],
      };
    });

    return result.sort((a, b) => b.revenueTotal - a.revenueTotal);
  }

  async getLiveKpis(): Promise<LiveKpisDto> {
    const now = new Date();
    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0,
      0,
      0,
      0,
    );
    const endOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
      999,
    );

    const [
      paidOrdersToday,
      occupiedMesaRecords,
      activeOrderTables,
      pendingKitchenOrders,
      activeDeliveryOrders,
    ] = await Promise.all([
      this.prisma.order.aggregate({
        where: {
          status: 'PAID',
          timestamp: { gte: startOfDay, lte: endOfDay },
        },
        _sum: { total: true },
      }),
      this.prisma.mesa.findMany({
        where: { estado: 'OCUPADO' },
        select: { id: true },
      }),
      this.prisma.orderTable.findMany({
        where: {
          order: {
            status: { in: ['PENDING', 'PREPARING', 'READY', 'DELIVERED'] },
            items: { some: {} },
          },
        },
        select: { tableId: true },
      }),
      this.prisma.order.count({
        where: {
          isSentToKitchen: true,
          status: { in: ['PENDING', 'PREPARING'] },
          items: { some: { isSentToKitchen: true } },
        },
      }),
      this.prisma.order.count({
        where: {
          orderType: 'DELIVERY',
          status: { in: ['PENDING', 'PREPARING', 'READY'] },
        },
      }),
    ]);

    const occupiedTableIds = new Set<string>([
      ...occupiedMesaRecords.map((m) => m.id),
      ...activeOrderTables.map((t) => t.tableId),
    ]);

    return {
      totalSalesToday: Number(paidOrdersToday._sum.total) || 0,
      activeOccupiedTables: occupiedTableIds.size,
      pendingKitchenOrders,
      activeDeliveryOrders,
    };
  }
}
