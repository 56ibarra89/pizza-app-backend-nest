import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { RolesGuard } from '../common/guards/roles.guard';
import { AccessControlController } from './access-control.controller';
import { AccessControlService } from './access-control.service';

describe('AccessControlController RBAC contract (B50)', () => {
  let app: any;
  const serviceMock = {
    listPermissions: jest.fn().mockResolvedValue([]),
    listRoles: jest.fn().mockResolvedValue([]),
    getRole: jest.fn().mockResolvedValue({ id: 'role-1' }),
    create: jest.fn().mockResolvedValue({ id: 'role-1' }),
    update: jest.fn().mockResolvedValue({ id: 'role-1' }),
    remove: jest.fn().mockResolvedValue(undefined),
    authorizationForUser: jest.fn().mockResolvedValue({ permissions: [] }),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AccessControlController],
      providers: [
        RolesGuard,
        { provide: AccessControlService, useValue: serviceMock },
      ],
    }).compile();

    app = module.createNestApplication();
    app.use((req: any, _res: any, next: () => void) => {
      req.user = {
        id: 'user-1',
        role: req.headers['x-role'] || 'cajero_principal',
        permissions: String(req.headers['x-permissions'] || '')
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
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

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => jest.clearAllMocks());

  it('bloquea rutas administrativas a roles no admin incluso si tienen permisos delegados', async () => {
    await request(app.getHttpServer())
      .get('/access-control/permissions')
      .set('x-role', 'cajero_principal')
      .set('x-permissions', 'roles.read,roles.manage')
      .expect(403);

    await request(app.getHttpServer())
      .get('/access-control/roles')
      .set('x-role', 'cajero_principal')
      .set('x-permissions', 'roles.read,roles.manage')
      .expect(403);

    await request(app.getHttpServer())
      .delete('/access-control/roles/11111111-1111-4111-8111-111111111111')
      .set('x-role', 'cajero_principal')
      .set('x-permissions', 'roles.read,roles.manage')
      .expect(403);
  });

  it('permite consultar /access-control/me a cualquier autenticado y gestión de roles a admin', async () => {
    await request(app.getHttpServer())
      .get('/access-control/me')
      .set('x-role', 'motorizado')
      .expect(200);

    await request(app.getHttpServer())
      .get('/access-control/roles')
      .set('x-role', 'admin')
      .set('x-permissions', 'roles.read')
      .expect(200);

    expect(serviceMock.listRoles).toHaveBeenCalledTimes(1);
  });
});
