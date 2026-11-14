import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { CustomersController } from './customers.controller';
import { CustomersService } from '../services/customers.service';
import { RolesGuard } from '../../common/guards/roles.guard';

describe('Customer pagination HTTP contract', () => {
  let app: any;
  const getPage = jest.fn().mockResolvedValue({ items: [], total: 42 });
  const create = jest.fn().mockImplementation(async (dto: any) => ({
    id: 'cust-1',
    name: dto.name,
    nameLower: String(dto.name || '').toLowerCase(),
    phone: dto.phone ?? dto.phones?.[0]?.phone ?? null,
    phones: (dto.phones ?? []).map((p: any, idx: number) => ({
      id: p.id ?? `phone-${idx}`,
      customerId: 'cust-1',
      phone: p.phone,
      isDefault: Boolean(p.isDefault),
      lastUsed: new Date('2026-11-13T12:00:00Z'),
    })),
    addresses: (dto.addresses ?? []).map((a: any, idx: number) => ({
      id: a.id ?? `addr-${idx}`,
      customerId: 'cust-1',
      address: a.address,
      isDefault: Boolean(a.isDefault),
      lastUsed: new Date('2026-11-13T12:00:00Z'),
    })),
    createdAt: new Date('2026-11-13T12:00:00Z'),
    updatedAt: new Date('2026-11-13T12:00:00Z'),
  }));
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [CustomersController],
      providers: [
        RolesGuard,
        { provide: CustomersService, useValue: { getPage, create } },
      ],
    }).compile();
    app = module.createNestApplication();
    app.use((req: any, _res: any, next: () => void) => {
      const permHeader = req.headers['x-permissions'];
      req.user = {
        role: 'admin',
        permissions:
          permHeader === 'manage'
            ? ['customers.read', 'customers.manage']
            : permHeader
              ? ['customers.read']
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

  it('valida creación de cliente con múltiples teléfonos y direcciones', async () => {
    await request(app.getHttpServer())
      .post('/customers')
      .set('x-permissions', 'yes')
      .send({ name: 'Sin Permiso' })
      .expect(403);

    await request(app.getHttpServer())
      .post('/customers')
      .set('x-permissions', 'manage')
      .send({
        name: 'Carlos',
        extraField: 'rechazado',
      })
      .expect(400);

    await request(app.getHttpServer())
      .post('/customers')
      .set('x-permissions', 'manage')
      .send({
        name: 'Carlos Pérez',
        phone: '8888-0001',
        address: 'Casa 1',
        phones: [
          {
            id: 'p1',
            phone: '8888-0001',
            isDefault: true,
            lastUsed: '2026-11-13',
          },
          {
            id: 'p2',
            phone: '8888-0002',
            isDefault: false,
            lastUsed: '2026-11-13',
          },
        ],
        addresses: [
          {
            id: 'a1',
            address: 'Casa 1',
            isDefault: true,
            lastUsed: '2026-11-13',
          },
          {
            id: 'a2',
            address: 'Oficina 2',
            isDefault: false,
            lastUsed: '2026-11-13',
          },
        ],
      })
      .expect(201);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Carlos Pérez',
        phones: expect.arrayContaining([
          expect.objectContaining({ phone: '8888-0001', isDefault: true }),
          expect.objectContaining({ phone: '8888-0002', isDefault: false }),
        ]),
        addresses: expect.arrayContaining([
          expect.objectContaining({ address: 'Casa 1', isDefault: true }),
          expect.objectContaining({ address: 'Oficina 2', isDefault: false }),
        ]),
      }),
    );
  });
});
