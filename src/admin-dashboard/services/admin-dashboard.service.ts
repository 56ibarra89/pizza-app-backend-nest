import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { getBusinessDayBounds } from '../../common/time/business-time.util';
import type {
  ActiveCashRegisterDto,
  WaiterPerformanceDto,
  LiveKpisDto,
} from '../dto/admin-dashboard.dto';

interface CashierSalesRow {
  shiftId: string;
  cashierId: string | null;
  cashierSnapshotName: string | null;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  role: string | null;
  transactions: bigint;
  cash: Prisma.Decimal;
  card: Prisma.Decimal;
  app: Prisma.Decimal;
}

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

@Injectable()
export class AdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getActiveCashRegisters(): Promise<ActiveCashRegisterDto[]> {
    const shifts = await this.prisma.shift.findMany({
      where: { status: 'OPEN' },
      select: {
        id: true,
        cashierId: true,
        cashierSnapshotName: true,
        cashRegisterSnapshotName: true,
        startTime: true,
        openingAmount: true,
        cashier: {
          select: {
            firstName: true,
            lastName: true,
            username: true,
            role: true,
          },
        },
      },
      orderBy: { startTime: 'asc' },
    });

    if (shifts.length === 0) return [];
    const sales = await this.getCashierSales(shifts.map(({ id }) => id));
    const salesByShift = new Map<string, CashierSalesRow[]>();
    for (const row of sales) {
      const rows = salesByShift.get(row.shiftId);
      if (rows) rows.push(row);
      else salesByShift.set(row.shiftId, [row]);
    }

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

      for (const order of salesByShift.get(shift.id) ?? []) {
        const rawCashierRole = order.role ?? '';
        const isDriverCashier = rawCashierRole === 'MOTORIZADO';
        let orderKey: string;
        if (isDriverCashier) {
          orderKey = principalKey;
        } else if (order.cashierId) {
          orderKey = `user-${order.cashierId}`;
        } else if (order.cashierSnapshotName) {
          orderKey = `snap-${order.cashierSnapshotName.toLowerCase()}`;
        } else {
          orderKey = principalKey;
        }

        if (!collaboratorMap.has(orderKey)) {
          let collaboratorName = 'Cajero';
          let collaboratorRole = 'CAJERO';

          if (order.username) {
            collaboratorName =
              `${order.firstName ?? ''} ${order.lastName ?? ''}`.trim() ||
              order.username;
            collaboratorRole = order.role ?? 'CAJERO';
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
        entry.transactionsCompleted += Number(order.transactions);
        entry.revenueCash += order.cash.toNumber();
        entry.revenueCard += order.card.toNumber();
        entry.revenueApp += order.app.toNumber();
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

  private getCashierSales(shiftIds: string[]): Promise<CashierSalesRow[]> {
    return this.prisma.$queryRaw<CashierSalesRow[]>`
      WITH totals AS (
        SELECT o."shiftId", o."cashierId",
               MIN(o."cashierSnapshotName") AS "cashierSnapshotName",
               COUNT(*) AS transactions,
               SUM(CASE WHEN payments.count = 0 THEN o.total ELSE COALESCE(payments.cash, 0) END) AS cash,
               SUM(COALESCE(payments.card, 0)) AS card,
               SUM(COALESCE(payments.app, 0)) AS app
        FROM "Order" o
        CROSS JOIN LATERAL (
          SELECT COUNT(*) AS count,
                 SUM(p.amount) FILTER (WHERE p.method = 'EFECTIVO') AS cash,
                 SUM(p.amount) FILTER (WHERE p.method = 'TARJETA') AS card,
                 SUM(p.amount) FILTER (WHERE p.method = 'APP') AS app
          FROM "Payment" p
          WHERE p."orderId" = o.id
        ) payments
        WHERE o."shiftId" IN (${Prisma.join(shiftIds)})
          AND o.status = 'PAID'
          AND (o."invoiceNumber" IS NOT NULL OR o.total <> 0 OR payments.count > 0)
        GROUP BY o."shiftId", o."cashierId",
          CASE WHEN o."cashierId" IS NULL THEN lower(NULLIF(o."cashierSnapshotName", '')) END
      )
      SELECT totals.*, u."firstName", u."lastName", u.username, u.role::text AS role
      FROM totals
      LEFT JOIN "User" u ON u.id = totals."cashierId"
    `;
  }

  async getWaiterPerformance(): Promise<WaiterPerformanceDto[]> {
    const { startOfDay, endOfDay } = getBusinessDayBounds(new Date());

    const waiters = await this.prisma.user.findMany({
      where: { role: 'MESERO', isActive: true },
      select: { id: true, username: true, firstName: true, lastName: true },
    });
    if (waiters.length === 0) return [];

    const todayOrders = await this.prisma.order.findMany({
      where: {
        OR: [
          { paidAt: { gte: startOfDay, lte: endOfDay } },
          {
            paidAt: null,
            timestamp: { gte: startOfDay, lte: endOfDay },
          },
        ],
        // El rendimiento financiero solo considera ventas liquidadas. Los padres
        // ya liquidados en 0 sin factura propia (división completada) se omiten
        // en el bucle inferior para no duplicar ventas ni perder padres con saldo
        // cobrado por separado.
        status: 'PAID',
      },
      select: {
        id: true,
        parentOrderId: true,
        waiterId: true,
        waiterSnapshotName: true,
        invoiceNumber: true,
        total: true,
      },
    });

    const salesByWaiter = new Map(
      waiters.map(({ id }) => [
        id,
        { orderFamilies: new Set<string>(), revenueTotal: 0 },
      ]),
    );
    const waiterUsernames = new Map(
      waiters.map((waiter) => [waiter.username.toLowerCase(), waiter.id]),
    );

    for (const order of todayOrders) {
      const total = Number(order.total);
      if (order.invoiceNumber === null && total === 0) continue;

      // El snapshot identifica al mesero solo si la orden no tiene su ID (ADR-008).
      const waiterId =
        order.waiterId ??
        waiterUsernames.get(order.waiterSnapshotName?.trim().toLowerCase() ?? '');
      const sales = waiterId ? salesByWaiter.get(waiterId) : undefined;
      if (!sales) continue;

      sales.orderFamilies.add(order.parentOrderId ?? order.id);
      sales.revenueTotal += total;
    }

    const result: WaiterPerformanceDto[] = waiters.map((waiter, index) => {
      const sales = salesByWaiter.get(waiter.id)!;

      return {
        id: waiter.id,
        name:
          `${waiter.firstName} ${waiter.lastName}`.trim() || waiter.username,
        ordersServed: sales.orderFamilies.size,
        revenueTotal: sales.revenueTotal,
        avatarColor: AVATAR_COLORS[index % AVATAR_COLORS.length],
      };
    });

    return result.sort((a, b) => b.revenueTotal - a.revenueTotal);
  }

  async getLiveKpis(): Promise<LiveKpisDto> {
    const now = new Date();
    const { startOfDay, endOfDay } = getBusinessDayBounds(now);

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
          OR: [
            { paidAt: { gte: startOfDay, lte: endOfDay } },
            {
              paidAt: null,
              timestamp: { gte: startOfDay, lte: endOfDay },
            },
          ],
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
          status: { not: 'CANCELLED' },
          items: {
            some: {
              isSentToKitchen: true,
              requiresPreparation: true,
              OR: [
                { kitchenStatus: { in: ['PENDING', 'PREPARING'] } },
                { kitchenStatus: null },
              ],
            },
          },
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
