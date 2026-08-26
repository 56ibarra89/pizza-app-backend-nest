import { Test, TestingModule } from '@nestjs/testing';
import { AdminDashboardService } from './admin-dashboard.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('AdminDashboardService', () => {
  let service: AdminDashboardService;
  let prisma: {
    shift: { findMany: jest.Mock };
    user: { findMany: jest.Mock };
    order: { findMany: jest.Mock; aggregate: jest.Mock; count: jest.Mock };
    mesa: { findMany: jest.Mock };
    orderTable: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      shift: { findMany: jest.fn() },
      user: { findMany: jest.fn() },
      order: {
        findMany: jest.fn(),
        aggregate: jest.fn(),
        count: jest.fn(),
      },
      mesa: { findMany: jest.fn() },
      orderTable: { findMany: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminDashboardService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<AdminDashboardService>(AdminDashboardService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('returns active cash registers with proper payment sum', async () => {
    prisma.shift.findMany.mockResolvedValue([
      {
        id: 'shift-1',
        cashRegisterSnapshotName: 'Caja Principal',
        cashierId: 'user-1',
        cashierSnapshotName: 'cajero1',
        cashier: {
          firstName: 'Juan',
          lastName: 'Perez',
          username: 'juanp',
          role: 'CAJERO_PRINCIPAL',
        },
        startTime: new Date('2026-08-25T10:00:00Z'),
        openingAmount: 500,
        orders: [
          {
            id: 'ord-1',
            status: 'PAID',
            total: 1000,
            payments: [
              { method: 'EFECTIVO', amount: 600 },
              { method: 'TARJETA', amount: 400 },
            ],
          },
          {
            id: 'ord-2',
            status: 'PAID',
            total: 300,
            payments: [{ method: 'APP', amount: 300 }],
          },
        ],
      },
    ]);

    const result = await service.getActiveCashRegisters();

    expect(result).toHaveLength(1);
    expect(result[0].revenueCash).toBe(600);
    expect(result[0].revenueCard).toBe(400);
    expect(result[0].revenueApp).toBe(300);
    expect(result[0].revenueTotal).toBe(1300);
    expect(result[0].transactionsCompleted).toBe(2);
    expect(result[0].cashier).toBe('Juan Perez');
  });

  it('returns live KPIs correctly unifying occupied tables and active order tables', async () => {
    prisma.order.aggregate.mockResolvedValue({
      _sum: { total: 15400.5 },
    });
    prisma.mesa.findMany.mockResolvedValue([
      { id: 'F3-M1' },
    ]);
    prisma.orderTable.findMany.mockResolvedValue([
      { tableId: 'F2-M6' },
      { tableId: 'F2-M8' },
      { tableId: 'F3-M1' }, // Duplicate, should be deduplicated
    ]);
    prisma.order.count
      .mockResolvedValueOnce(3) // kitchen orders
      .mockResolvedValueOnce(2); // delivery orders

    const kpis = await service.getLiveKpis();

    expect(kpis.totalSalesToday).toBe(15400.5);
    expect(kpis.activeOccupiedTables).toBe(3); // F3-M1, F2-M6, F2-M8
    expect(kpis.pendingKitchenOrders).toBe(3);
    expect(kpis.activeDeliveryOrders).toBe(2);
  });
});
