import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { RolesGuard } from '../../common/guards/roles.guard';
import { APP_CONFIG_REPOSITORY } from '../interfaces/app-config.repository';
import { AppConfigService } from '../services/app-config.service';
import { AppConfigController } from './app-config.controller';

describe('Tarifas de delivery en AppConfig (RD-06)', () => {
  let app: INestApplication;
  const updatedAt = new Date('2026-11-20T12:00:00Z');
  const findById = jest.fn();
  const active = {
    id: 'a',
    name: 'Centro',
    price: 35,
    driverPayout: 20,
    isActive: true,
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AppConfigController],
      providers: [
        AppConfigService,
        RolesGuard,
        { provide: APP_CONFIG_REPOSITORY, useValue: { findById } },
      ],
    }).compile();
    app = module.createNestApplication();
    app.use(
      (
        req: Request & { user?: unknown },
        _res: Response,
        next: NextFunction,
      ) => {
        req.user = {
          role: 'cajero',
          permissions: req.headers['x-test-read'] ? ['settings.read'] : [],
        };
        next();
      },
    );
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
  beforeEach(() => findById.mockReset());

  it('deriva las tarifas activas y descarta la copia legado cuando hay zonas', async () => {
    findById.mockResolvedValue({
      data: {
        zones: [
          active,
          { ...active, id: 'b' },
          { ...active, id: 'c', price: 70, isActive: false },
        ],
      },
      updatedAt,
    });
    await request(app.getHttpServer())
      .get('/config/delivery_prices')
      .set('x-test-read', '1')
      .expect(200, {
        id: 'delivery_prices',
        data: { prices: ['35'] },
        updatedAt: updatedAt.toISOString(),
      });
    expect(findById.mock.calls).toEqual([['delivery_rules']]);
  });

  it('devuelve una lista vacía cuando todas las zonas están desactivadas', async () => {
    findById.mockResolvedValue({
      data: { zones: [{ ...active, isActive: false }] },
      updatedAt,
    });
    const response = await request(app.getHttpServer())
      .get('/config/delivery_prices')
      .set('x-test-read', '1')
      .expect(200);
    expect(response.body.data).toEqual({ prices: [] });
    expect(findById.mock.calls).toEqual([['delivery_rules']]);
  });

  it('eliminar la última zona no reactiva las tarifas anteriores', async () => {
    findById.mockResolvedValueOnce({
      data: { useZonePricing: true, zones: [] },
      updatedAt,
    });
    const response = await request(app.getHttpServer())
      .get('/config/delivery_prices')
      .set('x-test-read', '1')
      .expect(200);
    expect(response.body.data).toEqual({ prices: [] });
    expect(findById.mock.calls).toEqual([['delivery_rules']]);
  });

  it('conserva las tarifas legado sin zonas y el permiso de lectura', async () => {
    findById.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'delivery_prices',
      data: { prices: ['25'] },
      updatedAt,
    });
    await request(app.getHttpServer())
      .get('/config/delivery_prices')
      .expect(403);
    const response = await request(app.getHttpServer())
      .get('/config/delivery_prices')
      .set('x-test-read', '1')
      .expect(200);
    expect(response.body.data).toEqual({ prices: ['25'] });
    expect(findById.mock.calls).toEqual([
      ['delivery_rules'],
      ['delivery_prices'],
    ]);
  });
});
