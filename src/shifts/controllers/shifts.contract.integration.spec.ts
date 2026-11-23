import { INestApplication, ValidationPipe } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { ShiftStatus } from '@prisma/client';
import request from 'supertest';
import { RolesGuard, UserRoleDto } from '../../common';
import { SHIFTS_REPOSITORY } from '../interfaces/shifts.repository';
import { ShiftsService } from '../services/shifts.service';
import { ShiftsController } from './shifts.controller';

describe('Conteo físico por moneda RD-18', () => {
  const shift = {
    id: 'turno-1',
    cashierId: 'cajero-1',
    status: ShiftStatus.OPEN,
  };
  const close = jest.fn();
  const repo = {
    findById: jest.fn().mockResolvedValue(shift),
    getClosePreview: jest.fn().mockResolvedValue({
      shiftId: shift.id,
      expectedCash: 865,
      cashUsd: { equivalentNio: 365, expectedUsd: 10 },
      sales: { card: 0, app: 0 },
      blockingOrders: [],
      blockingTables: [],
      canClose: true,
    }),
    close,
  };
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ShiftsController],
      providers: [
        ShiftsService,
        RolesGuard,
        { provide: SHIFTS_REPOSITORY, useValue: repo },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();
    app = module.createNestApplication();
    app.use((req, _res, next) => {
      req.user = {
        id: 'cajero-1',
        username: 'cajero',
        role: UserRoleDto.cajero,
        permissions: String(req.headers['x-test-permissions'] ?? '').split(','),
      };
      next();
    });
    app.useGlobalGuards(module.get(RolesGuard));
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterAll(() => app.close());

  it('valida córdobas y dólares en el arqueo ciego sin exponer los montos esperados', async () => {
    const response = await request(app.getHttpServer())
      .get('/shifts/turno-1/close-preview?countedCash=500&countedUsd=10')
      .set('x-test-permissions', 'cash.close')
      .expect(200);
    expect(response.body).toMatchObject({
      requiresUsdCount: true,
      requiresAuthorization: false,
    });
    expect(response.body).not.toHaveProperty('expectedCash');
    expect(response.body).not.toHaveProperty('cashUsd');

    const withLocalChange = await request(app.getHttpServer())
      .get('/shifts/turno-1/close-preview?countedCash=135&countedUsd=20')
      .set('x-test-permissions', 'cash.close')
      .expect(200);
    expect(withLocalChange.body.requiresAuthorization).toBe(false);

    const shortfall = await request(app.getHttpServer())
      .get('/shifts/turno-1/close-preview?countedCash=500&countedUsd=9')
      .set('x-test-permissions', 'cash.close')
      .expect(200);
    expect(shortfall.body.requiresAuthorization).toBe(true);
  });

  it('acepta solo denominaciones de dólar válidas al enviar el cierre', async () => {
    close.mockResolvedValue({ ...shift, status: ShiftStatus.CLOSED });
    const closeDto = {
      closingAmount: 500,
      countedUsd: 10,
      denominationBreakdown: [{ denomination: 500, quantity: 1 }],
      usdDenominationBreakdown: [{ denomination: 5, quantity: 2 }],
    };
    await request(app.getHttpServer())
      .post('/shifts/turno-1/close')
      .set('x-test-permissions', 'cash.status')
      .send(closeDto)
      .expect(403);
    await request(app.getHttpServer())
      .post('/shifts/turno-1/close')
      .set('x-test-permissions', 'cash.close')
      .send({
        ...closeDto,
        usdDenominationBreakdown: [{ denomination: 500, quantity: 1 }],
      })
      .expect(400);
    await request(app.getHttpServer())
      .post('/shifts/turno-1/close')
      .set('x-test-permissions', 'cash.close')
      .send(closeDto)
      .expect(201);
    expect(close).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledWith(expect.objectContaining(closeDto));
  });
});
