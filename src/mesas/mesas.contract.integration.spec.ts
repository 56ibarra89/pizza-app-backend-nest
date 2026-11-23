import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { AppConfigService } from '../app-config/services/app-config.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import { SystemLogsService } from '../system-logs/services/system-logs.service';
import { MesasController } from './mesas.controller';
import { MesasService } from './mesas.service';

describe('Reservation HTTP contract (RD-19)', () => {
  let app: INestApplication;
  const tableId = 'F1-M1';
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  const findUnique = jest.fn().mockResolvedValue({ id: tableId });

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [MesasController],
      providers: [
        MesasService,
        RolesGuard,
        { provide: AppConfigService, useValue: {} },
        { provide: SystemLogsService, useValue: {} },
        {
          provide: PrismaService,
          useValue: {
            mesa: { count: jest.fn().mockResolvedValue(1), updateMany, findUnique },
            orderTable: { count: jest.fn().mockResolvedValue(0) },
          },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    app.use((req: Request & { user?: unknown }, _res: Response, next: NextFunction) => {
      req.user = {
        role: 'mesero',
        permissions: req.headers['x-test-operate'] ? ['tables.operate'] : [],
      };
      next();
    });
    app.useGlobalGuards(module.get(RolesGuard));
    app.useGlobalPipes(new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }));
    await app.init();
  });

  afterAll(() => app.close());

  it('protects reservation writes and stores a valid future deadline', async () => {
    const base = { reservationName: 'Prueba', reservationAmount: 0 };
    const now = Date.now();
    const reservationTime = new Date(now + 120_000);
    const expirationTime = new Date(now + 2_000_000);
    await request(app.getHttpServer()).patch(`/mesas/${tableId}/reserve`)
      .send(base).expect(403);
    await request(app.getHttpServer()).patch(`/mesas/${tableId}/reserve`)
      .set('x-test-operate', '1')
      .send({ ...base, expirationTime: new Date(now - 30_000).toISOString() })
      .expect(400);
    expect(updateMany).not.toHaveBeenCalled();
    await request(app.getHttpServer()).patch(`/mesas/${tableId}/reserve`)
      .set('x-test-operate', '1')
      .send({
        ...base,
        reservationTime: reservationTime.toISOString(),
        expirationTime: expirationTime.toISOString(),
      })
      .expect(200);
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ reservationTime, expirationTime }),
    }));
  });
});
