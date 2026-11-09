import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { CustomersController } from './customers.controller';
import { CustomersService } from '../services/customers.service';
import { RolesGuard } from '../../common/guards/roles.guard';

describe('Customer pagination HTTP contract', () => {
  let app: any;
  const getPage = jest.fn().mockResolvedValue({ items: [], total: 42 });
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [CustomersController],
      providers: [
        RolesGuard,
        { provide: CustomersService, useValue: { getPage } },
      ],
    }).compile();
    app = module.createNestApplication();
    app.use((req: any, _res: any, next: () => void) => {
      req.user = {
        role: 'admin',
        permissions: req.headers['x-permissions'] ? ['customers.read'] : [],
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
  it('valida paginación, filtro y permisos', async () => {
    await request(app.getHttpServer())
      .get('/customers/page?page=2&limit=10&query=Ana')
      .set('x-permissions', 'yes')
      .expect(200, { items: [], total: 42 });
    expect(getPage).toHaveBeenCalledWith(2, 10, 'Ana');
    await request(app.getHttpServer())
      .get('/customers/page?limit=101')
      .set('x-permissions', 'yes')
      .expect(400);
    await request(app.getHttpServer())
      .get('/customers/page?page=-1')
      .set('x-permissions', 'yes')
      .expect(400);
    await request(app.getHttpServer()).get('/customers/page').expect(403);
  });
});
