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
});
