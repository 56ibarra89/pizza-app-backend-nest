import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma, ShiftStatus } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { AppConfigService } from '../../app-config/services/app-config.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { UserRoleDto } from '../../common';
import { PrismaService } from '../../prisma/prisma.service';
import { ShiftsService } from '../../shifts/services/shifts.service';
import { USERS_REPOSITORY } from '../../users/interfaces/users.repository';
import { CASH_EXPENSES_REPOSITORY } from '../interfaces/cash-expenses.repository';
import { PrismaCashExpensesRepository } from '../repositories/prisma-cash-expenses.repository';
import { CashExpensesService } from '../services/cash-expenses.service';
import { CashExpensesController } from './cash-expenses.controller';

describe('Reintentos de egresos (RD-14)', () => {
  let app: INestApplication;
  let status: ShiftStatus;
  const id = 'fa376e7a-7a84-4c92-8300-ef233a58d3fb';
  const shiftId = 'shift-1';
  const expense = {
    id,
    shiftId,
    amount: 200,
    category: 'OTROS',
    reason: 'Compra de hielo',
    voucherNumber: 'REC-1',
  };
  const saved = new Map<string, Prisma.CashExpenseCreateInput>();
  const create = jest.fn(({ data }) => {
    const row = {
      ...data,
      id: data.id ?? 'legacy-id',
      createdAt: new Date('2026-11-20T15:00:00Z'),
      updatedAt: new Date('2026-11-20T15:00:00Z'),
    };
    saved.set(row.id, row);
    return row;
  });
  const store = {
    cashExpense: {
      findUnique: jest.fn(({ where }) => saved.get(where.id) ?? null),
      aggregate: jest.fn(() => ({
        _sum: {
          amount: [...saved.values()].reduce(
            (sum, row) => sum.add(row.amount as Prisma.Decimal),
            new Prisma.Decimal(0),
          ),
        },
      })),
      create,
    },
    $queryRaw: jest.fn(() => [{ id: shiftId, status }]),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [CashExpensesController],
      providers: [
        RolesGuard,
        CashExpensesService,
        {
          provide: CASH_EXPENSES_REPOSITORY,
          useClass: PrismaCashExpensesRepository,
        },
        {
          provide: PrismaService,
          useValue: { ...store, $transaction: (run) => run(store) },
        },
        {
          provide: ShiftsService,
          useValue: {
            getSummaryById: () => ({ id: shiftId, status }),
            getActiveSummary: () => ({ id: shiftId, status }),
          },
        },
        {
          provide: AppConfigService,
          useValue: {
            getByIdOrDefault: () => ({ data: { maxShiftTotal: 300 } }),
          },
        },
        { provide: USERS_REPOSITORY, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    app.use(
      (
        req: Request & { user?: AuthenticatedUser },
        _res: Response,
        next: NextFunction,
      ) => {
        req.user = {
          id: req.get('x-test-cashier') ?? 'cashier-1',
          username: 'cajero',
          role: UserRoleDto.cajero,
          permissions: req.get('x-test-permitted') ? ['cash.expenses'] : [],
        };
        next();
      },
    );
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  beforeEach(() => {
    status = ShiftStatus.OPEN;
    saved.clear();
    jest.clearAllMocks();
  });

  afterAll(() => app.close());

  const post = () =>
    request(app.getHttpServer())
      .post('/cash-expenses')
      .set('x-test-permitted', 'yes');

  it('recupera el egreso guardado aunque el turno haya cerrado', async () => {
    const first = await post().send(expense).expect(201);
    status = ShiftStatus.CLOSED;
    const retry = await post().send(expense).expect(201);
    expect(retry.body).toEqual(first.body);
    expect(retry.body.id).toBe(id);
    expect(create).toHaveBeenCalledTimes(1);
    expect(store.$queryRaw).toHaveBeenCalledTimes(1);
    expect(saved.size).toBe(1);
  });

  it('rechaza reutilizar el ID para otro gasto, turno o autor', async () => {
    await post().send(expense).expect(201);
    await post()
      .send({ ...expense, amount: 150 })
      .expect(409);
    await post()
      .send({ ...expense, shiftId: 'another-shift' })
      .expect(409);
    await post().set('x-test-cashier', 'cashier-2').send(expense).expect(409);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('valida el UUID y conserva compatibilidad con clientes sin ID', async () => {
    await request(app.getHttpServer())
      .post('/cash-expenses')
      .send(expense)
      .expect(403);
    await post()
      .send({ ...expense, id: 'id-inválido' })
      .expect(400);
    expect(create).not.toHaveBeenCalled();

    const { id: _id, ...legacyExpense } = expense;
    const first = await post().send(legacyExpense).expect(201);
    expect(first.body.id).toBe('legacy-id');
  });

  it('recupera el intento que ganó una carrera de escritura', async () => {
    create.mockImplementationOnce(({ data }) => {
      saved.set(id, {
        ...data,
        id,
        createdAt: new Date('2026-11-20T15:00:00Z'),
        updatedAt: new Date('2026-11-20T15:00:00Z'),
      });
      throw new Prisma.PrismaClientKnownRequestError('conflicto de PK', {
        code: 'P2002',
        clientVersion: 'test',
      });
    });
    const retry = await post().send(expense).expect(201);
    expect(retry.body.id).toBe(id);
    expect(store.cashExpense.findUnique).toHaveBeenCalledTimes(2);
    expect(saved.size).toBe(1);
  });
});
