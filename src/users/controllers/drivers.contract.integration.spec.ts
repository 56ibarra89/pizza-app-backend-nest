import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { UsersController } from './users.controller';
import { UsersService } from '../services/users.service';
import { RolesGuard } from '../../common/guards/roles.guard';

describe('Drivers HTTP contract', () => {
  let app: any;
  const list = jest.fn().mockResolvedValue([]);
  const listWaiters = jest.fn().mockResolvedValue([]);
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        RolesGuard,
        {
          provide: UsersService,
          useValue: {
            getAvailableDrivers: list,
            getActiveWaiters: listWaiters,
          },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    app.use((req: any, _res: any, next: () => void) => {
      const requestedPermissions = req.headers['x-permissions'];
      req.user = {
        role: 'admin',
        permissions:
          requestedPermissions === 'yes'
            ? ['users.directory']
            : typeof requestedPermissions === 'string'
              ? requestedPermissions.split(',')
              : [],
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
  it('valida fecha y permiso de directorio', async () => {
    await request(app.getHttpServer())
      .get('/users/drivers?date=2026-11-08')
      .set('x-permissions', 'yes')
      .expect(200);
    expect(list).toHaveBeenCalledWith('2026-11-08');
    await request(app.getHttpServer())
      .get('/users/drivers?date=invalid')
      .set('x-permissions', 'yes')
      .expect(400);
    await request(app.getHttpServer())
      .get('/users/drivers')
      .set('x-permissions', 'yes')
      .expect(400);
    await request(app.getHttpServer())
      .get('/users/drivers?date=2026-11-08')
      .expect(403);
  });

  it('expone únicamente meseros activos para reasignación de mesas', async () => {
    await request(app.getHttpServer())
      .get('/users/waiters')
      .set('x-permissions', 'tables.operate')
      .expect(200);
    expect(listWaiters).toHaveBeenCalledTimes(1);

    await request(app.getHttpServer()).get('/users/waiters').expect(403);
  });
});
