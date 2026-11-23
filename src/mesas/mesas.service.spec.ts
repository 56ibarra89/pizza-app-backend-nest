import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MesasService } from './mesas.service';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../app-config/services/app-config.service';
import { SystemLogsService } from '../system-logs/services/system-logs.service';

describe('MesasService', () => {
  let service: MesasService;
  let prismaMock: {
    $transaction: jest.Mock;
    mesa: {
      count: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      createMany: jest.Mock;
      deleteMany: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    orderTable: {
      count: jest.Mock;
    };
    appConfig: {
      upsert: jest.Mock;
    };
  };
  let appConfigServiceMock: {
    getByIdOrDefault: jest.Mock;
    upsert: jest.Mock;
  };
  let systemLogsMock: {
    createProcess: jest.Mock;
  };

  beforeEach(async () => {
    prismaMock = {
      $transaction: jest.fn(async (callback: (tx: unknown) => unknown) =>
        callback(prismaMock),
      ),
      mesa: {
        count: jest.fn().mockResolvedValue(2),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      orderTable: {
        count: jest.fn().mockResolvedValue(0),
      },
      appConfig: {
        upsert: jest.fn().mockResolvedValue({}),
      },
    };
    appConfigServiceMock = {
      getByIdOrDefault: jest.fn().mockResolvedValue({
        id: 'floors_config',
        data: [
          { id: 1, name: 'Primera Planta', tableCount: 3 },
          { id: 2, name: 'Segunda Planta', tableCount: 2 },
        ],
      }),
      upsert: jest.fn().mockResolvedValue({}),
    };
    systemLogsMock = {
      createProcess: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MesasService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AppConfigService, useValue: appConfigServiceMock },
        { provide: SystemLogsService, useValue: systemLogsMock },
      ],
    }).compile();

    service = module.get<MesasService>(MesasService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('no modifica floors_config ni elimina mesas de otras plantas si una planta reducida tiene mesas ocupadas o con historial (H27)', async () => {
    prismaMock.mesa.findMany.mockImplementation(
      async ({ where }: { where: { floor: number } }) => {
        if (where.floor === 2) {
          return [
            { id: 'F2-M1', floor: 2, number: 1, estado: 'DISPONIBLE' },
            { id: 'F2-M2', floor: 2, number: 2, estado: 'DISPONIBLE' },
          ];
        }
        if (where.floor === 1) {
          return [
            { id: 'F1-M1', floor: 1, number: 1, estado: 'DISPONIBLE' },
            { id: 'F1-M2', floor: 1, number: 2, estado: 'DISPONIBLE' },
            { id: 'F1-M3', floor: 1, number: 3, estado: 'OCUPADO' },
          ];
        }
        return [];
      },
    );

    await expect(
      service.updateFloorsConfig([
        { id: 1, name: 'Primera Planta', tableCount: 2 },
      ]),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prismaMock.mesa.deleteMany).not.toHaveBeenCalled();
    expect(prismaMock.mesa.createMany).not.toHaveBeenCalled();
    expect(prismaMock.appConfig.upsert).not.toHaveBeenCalled();
    expect(appConfigServiceMock.upsert).not.toHaveBeenCalled();
  });

  it('aplica eliminaciones, creaciones y actualización de floors_config de forma atómica cuando todas las validaciones pasan (H27)', async () => {
    prismaMock.mesa.findMany.mockImplementation(
      async ({ where }: { where: { floor: number } }) => {
        if (where.floor === 1) {
          return [
            { id: 'F1-M1', floor: 1, number: 1, estado: 'DISPONIBLE' },
            { id: 'F1-M2', floor: 1, number: 2, estado: 'DISPONIBLE' },
            { id: 'F1-M3', floor: 1, number: 3, estado: 'DISPONIBLE' },
          ];
        }
        if (where.floor === 2) {
          return [
            { id: 'F2-M1', floor: 2, number: 1, estado: 'DISPONIBLE' },
            { id: 'F2-M2', floor: 2, number: 2, estado: 'DISPONIBLE' },
          ];
        }
        return [];
      },
    );

    const updatedFloors = [
      { id: 1, name: 'Primera Planta', tableCount: 2 },
      { id: 2, name: 'Segunda Planta', tableCount: 4 },
    ];

    const result = await service.updateFloorsConfig(updatedFloors);

    expect(result).toEqual(updatedFloors);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.mesa.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['F1-M3'] } },
    });
    expect(prismaMock.mesa.createMany).toHaveBeenCalledWith({
      data: [
        { id: 'F2-M3', floor: 2, number: 3, estado: 'DISPONIBLE' },
        { id: 'F2-M4', floor: 2, number: 4, estado: 'DISPONIBLE' },
      ],
    });
    expect(prismaMock.appConfig.upsert).toHaveBeenCalledWith({
      where: { id: 'floors_config' },
      create: { id: 'floors_config', data: updatedFloors },
      update: { data: updatedFloors },
    });
  });

  it('rechaza reserva concurrente en reserveMesa cuando la mesa deja de estar DISPONIBLE (B34)', async () => {
    prismaMock.mesa.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.mesa.findUnique.mockResolvedValue({
      id: 'F1-M1',
      estado: 'RESERVADO',
    });

    await expect(
      service.reserveMesa('F1-M1', {
        reservationName: 'Carlos',
        reservationAmount: 500,
        reservationTime: new Date(Date.now() + 60_000).toISOString(),
        expirationTime: new Date(Date.now() + 31 * 60_000).toISOString(),
      }),
    ).rejects.toThrow('La mesa F1-M1 no está disponible para reservar.');

    expect(prismaMock.mesa.updateMany).toHaveBeenCalledWith({
      where: { id: 'F1-M1', estado: 'DISPONIBLE', isActive: true },
      data: expect.objectContaining({
        estado: 'RESERVADO',
        reservationName: 'Carlos',
      }),
    });
    expect(prismaMock.mesa.update).not.toHaveBeenCalled();
  });

  it('rechaza un vencimiento pasado o anterior al inicio (RD-19)', async () => {
    const now = Date.now();
    await expect(service.reserveMesa('F1-M1', {
      reservationName: 'Carlos',
      reservationAmount: 0,
      expirationTime: new Date(now - 60_000).toISOString(),
    })).rejects.toThrow('posterior a la hora actual');
    await expect(service.reserveMesa('F1-M1', {
      reservationName: 'Carlos',
      reservationAmount: 0,
      reservationTime: new Date(now + 30 * 60_000).toISOString(),
      expirationTime: new Date(now + 20 * 60_000).toISOString(),
    })).rejects.toThrow('posterior al inicio');
    expect(prismaMock.mesa.updateMany).not.toHaveBeenCalled();
  });

  it('limpia los metadatos de reserva en updateStatus cuando pasa a DISPONIBLE (B34)', async () => {
    prismaMock.mesa.findUnique.mockResolvedValue({
      id: 'F1-M1',
      estado: 'RESERVADO',
    });
    prismaMock.mesa.update.mockResolvedValue({
      id: 'F1-M1',
      estado: 'DISPONIBLE',
      reservationName: null,
      reservationAmount: null,
      reservationTime: null,
      expirationTime: null,
    });

    await service.updateStatus('F1-M1', 'DISPONIBLE');

    expect(prismaMock.mesa.update).toHaveBeenCalledWith({
      where: { id: 'F1-M1' },
      data: {
        estado: 'DISPONIBLE',
        reservationName: null,
        reservationAmount: null,
        reservationTime: null,
        expirationTime: null,
      },
    });
  });

  it('desactiva mesas con historial al reducir plantas y las reactiva si vuelven a crearse (B42)', async () => {
    let f1m2Active = true;
    prismaMock.mesa.findMany.mockImplementation(
      async ({ where }: { where: { floor?: number; isActive?: boolean } }) => {
        if (where?.floor === 1) {
          return [
            {
              id: 'F1-M1',
              floor: 1,
              number: 1,
              estado: 'DISPONIBLE',
              isActive: true,
            },
            {
              id: 'F1-M2',
              floor: 1,
              number: 2,
              estado: 'DISPONIBLE',
              isActive: f1m2Active,
            },
          ];
        }
        return [];
      },
    );
    prismaMock.orderTable.count.mockResolvedValueOnce(4);

    await service.updateFloorsConfig([
      { id: 1, name: 'Primera Planta', tableCount: 1 },
    ]);

    expect(prismaMock.mesa.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['F1-M2'] } },
      data: expect.objectContaining({
        isActive: false,
        estado: 'DISPONIBLE',
      }),
    });
    expect(prismaMock.mesa.deleteMany).not.toHaveBeenCalled();

    f1m2Active = false;

    await service.updateFloorsConfig([
      { id: 1, name: 'Primera Planta', tableCount: 2 },
    ]);

    expect(prismaMock.mesa.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['F1-M2'] } },
      data: expect.objectContaining({
        isActive: true,
        estado: 'DISPONIBLE',
      }),
    });

    await service.getMesas();
    expect(prismaMock.mesa.findMany).toHaveBeenLastCalledWith({
      where: { isActive: true },
      orderBy: [{ floor: 'asc' }, { number: 'asc' }],
    });

    prismaMock.mesa.findUnique.mockResolvedValueOnce({
      id: 'F1-M2',
      isActive: false,
      estado: 'DISPONIBLE',
    });
    await expect(
      service.updateStatus('F1-M2', 'OCUPADO'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
