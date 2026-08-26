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
          include: { payments: true },
        },
      },
      orderBy: { startTime: 'asc' },
    });

    return shifts.map((shift) => {
      let revenueCash = 0;
      let revenueCard = 0;
      let revenueApp = 0;

      shift.orders.forEach((order) => {
        if (order.payments && order.payments.length > 0) {
          order.payments.forEach((payment) => {
            const amount = Number(payment.amount) || 0;
            const method = (payment.method || '').toUpperCase();
            if (method === 'EFECTIVO') revenueCash += amount;
            else if (method === 'TARJETA') revenueCard += amount;
            else if (method === 'APP') revenueApp += amount;
            else revenueCash += amount;
          });
        } else {
          revenueCash += Number(order.total) || 0;
        }
      });

      const revenueTotal = revenueCash + revenueCard + revenueApp;
      const cashierFullName = shift.cashier
        ? `${shift.cashier.firstName} ${shift.cashier.lastName}`.trim() ||
          shift.cashier.username
        : shift.cashierSnapshotName;

      const roleStr = (shift.cashier?.role || 'CAJERO_PRINCIPAL').toUpperCase();

      return {
        id: shift.id,
        name: shift.cashRegisterSnapshotName || 'Caja Principal',
        cashierId: shift.cashierId || '',
        cashier: cashierFullName,
        cashierRole: roleStr,
        startTime: shift.startTime,
        openingAmount: Number(shift.openingAmount) || 0,
        revenueCash,
        revenueCard,
        revenueApp,
        revenueTotal,
        transactionsCompleted: shift.orders.length,
      };
    });
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
