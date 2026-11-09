import {
  Injectable,
  BadRequestException,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Prisma, MesaEstado } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../app-config/services/app-config.service';
import { UpdateFloorDto } from './dto/update-floor.dto';
import { ReserveMesaDto } from './dto/reserve-mesa.dto';
import { SystemLogsService } from '../system-logs/services/system-logs.service';

const FLOORS_CONFIG_KEY = 'floors_config';

const DEFAULT_FLOORS: UpdateFloorDto[] = [
  { id: 1, name: 'Primera Planta', tableCount: 0 },
  { id: 2, name: 'Segunda Planta', tableCount: 0 },
  { id: 3, name: 'Tercera Planta', tableCount: 0 },
  { id: 4, name: 'Cuarta Planta', tableCount: 0 },
  { id: 5, name: 'Quinta Planta', tableCount: 0 },
  { id: 6, name: 'Sexta Planta', tableCount: 0 },
  { id: 7, name: 'Séptima Planta', tableCount: 0 },
  { id: 8, name: 'Octava Planta', tableCount: 0 },
];

@Injectable()
export class MesasService implements OnModuleInit {
  private readonly logger = new Logger(MesasService.name);

  constructor(
    private prisma: PrismaService,
    private appConfigService: AppConfigService,
    private readonly systemLogs: SystemLogsService,
  ) {}

  async onModuleInit() {
    const tableCount = await this.prisma.mesa.count();
    if (tableCount === 0) {
      await this.updateFloorsConfig(DEFAULT_FLOORS);
    }
  }

  async getFloorsConfig() {
    const config =
      await this.appConfigService.getByIdOrDefault(FLOORS_CONFIG_KEY);
    if (
      !config.data ||
      (!Array.isArray(config.data) && Object.keys(config.data).length === 0)
    ) {
      return DEFAULT_FLOORS;
    }
    return config.data as UpdateFloorDto[];
  }

  async updateFloorsConfig(floors: UpdateFloorDto[]) {
    const seenIds = new Set<number>();
    for (const floor of floors) {
      if (!Number.isInteger(floor.id) || floor.id <= 0) {
        throw new BadRequestException(
          `El identificador de planta "${floor.id}" no es válido.`,
        );
      }
      if (seenIds.has(floor.id)) {
        throw new BadRequestException(
          `La planta con identificador ${floor.id} está duplicada.`,
        );
      }
      seenIds.add(floor.id);
      if (!Number.isInteger(floor.tableCount) || floor.tableCount < 0) {
        throw new BadRequestException(
          `La cantidad de mesas para la planta "${floor.name}" no es válida.`,
        );
      }
    }

    const oldConfig = await this.getFloorsConfig();
    const newFloorIds = floors.map((f) => f.id);
    const removedFloors = oldConfig.filter((f) => !newFloorIds.includes(f.id));

    const runAtomicUpdate = async (tx: Prisma.TransactionClient) => {
      const tableIdsToDelete: string[] = [];
      const tablesToCreate: Prisma.MesaCreateManyInput[] = [];

      // Fase 1: Validar todas las plantas eliminadas antes de escribir cambios
      for (const removedFloor of removedFloors) {
        const mesas = await tx.mesa.findMany({
          where: { floor: removedFloor.id },
          orderBy: { number: 'asc' },
        });
        for (const t of mesas) {
          if (t.estado !== 'DISPONIBLE') {
            throw new BadRequestException(
              `No se puede eliminar la planta "${removedFloor.name}" porque tiene la mesa ${t.number} ocupada.`,
            );
          }
          const linkedOrders = await tx.orderTable.count({
            where: { tableId: t.id },
          });
          if (linkedOrders > 0) {
            throw new BadRequestException(
              `No se puede eliminar la planta "${removedFloor.name}" porque la mesa ${t.number} tiene historial de pedidos. En su lugar, ajusta el número de mesas a 0 para ocultarla.`,
            );
          }
          tableIdsToDelete.push(t.id);
        }
      }

      // Fase 2: Validar todas las plantas actualizadas o reducidas antes de escribir cambios
      for (const floor of floors) {
        const existingMesas = await tx.mesa.findMany({
          where: { floor: floor.id },
          orderBy: { number: 'asc' },
        });

        const existingByNumber = new Set(existingMesas.map((m) => m.number));
        for (let i = 1; i <= floor.tableCount; i++) {
          if (!existingByNumber.has(i)) {
            tablesToCreate.push({
              id: `F${floor.id}-M${i}`,
              floor: floor.id,
              number: i,
              estado: 'DISPONIBLE' as const,
            });
          }
        }

        const tablesToDelete = existingMesas.filter(
          (m) => m.number > floor.tableCount,
        );
        for (const t of tablesToDelete) {
          if (t.estado !== 'DISPONIBLE') {
            throw new BadRequestException(
              `No se puede eliminar la mesa ${t.number} de la planta "${floor.name}" porque no está disponible.`,
            );
          }
          const linkedOrders = await tx.orderTable.count({
            where: { tableId: t.id },
          });
          if (linkedOrders > 0) {
            throw new BadRequestException(
              `No se puede eliminar la mesa ${t.number} de la planta "${floor.name}" porque tiene historial de pedidos. En su lugar, ajusta el número de mesas a 0 o déjala intacta para no romper reportes antiguos.`,
            );
          }
          tableIdsToDelete.push(t.id);
        }
      }

      // Fase 3: Aplicar mutaciones de forma atómica una vez superadas todas las validaciones
      if (tableIdsToDelete.length > 0) {
        await tx.mesa.deleteMany({
          where: { id: { in: tableIdsToDelete } },
        });
      }

      if (tablesToCreate.length > 0) {
        await tx.mesa.createMany({ data: tablesToCreate });
      }

      if (tx.appConfig?.upsert) {
        await tx.appConfig.upsert({
          where: { id: FLOORS_CONFIG_KEY },
          create: {
            id: FLOORS_CONFIG_KEY,
            data: floors as unknown as Prisma.InputJsonValue,
          },
          update: {
            data: floors as unknown as Prisma.InputJsonValue,
          },
        });
      } else {
        await this.appConfigService.upsert(FLOORS_CONFIG_KEY, { data: floors });
      }

      return floors;
    };

    if (typeof this.prisma.$transaction === 'function') {
      return this.prisma.$transaction(runAtomicUpdate);
    }

    return runAtomicUpdate(this.prisma);
  }

  async getMesas() {
    return this.prisma.mesa.findMany({
      orderBy: [{ floor: 'asc' }, { number: 'asc' }],
    });
  }

  async updateStatus(id: string, estado: MesaEstado) {
    const mesa = await this.prisma.mesa.findUnique({ where: { id } });
    if (!mesa) throw new BadRequestException(`La mesa ${id} no existe.`);

    return this.prisma.mesa.update({
      where: { id },
      data: { estado },
    });
  }

  async reserveMesa(id: string, dto: ReserveMesaDto) {
    const mesa = await this.prisma.mesa.findUnique({ where: { id } });
    if (!mesa) throw new BadRequestException(`La mesa ${id} no existe.`);
    if (mesa.estado !== 'DISPONIBLE') {
      throw new BadRequestException(
        `La mesa ${id} no está disponible para reservar.`,
      );
    }

    return this.prisma.mesa.update({
      where: { id },
      data: {
        estado: 'RESERVADO',
        reservationName: dto.reservationName,
        reservationAmount: dto.reservationAmount,
        reservationTime: dto.reservationTime
          ? new Date(dto.reservationTime)
          : null,
        expirationTime: dto.expirationTime
          ? new Date(dto.expirationTime)
          : null,
      },
    });
  }

  async releaseMesa(id: string) {
    const mesa = await this.prisma.mesa.findUnique({ where: { id } });
    if (!mesa) throw new BadRequestException(`La mesa ${id} no existe.`);

    return this.prisma.mesa.update({
      where: { id },
      data: {
        estado: 'DISPONIBLE',
        reservationName: null,
        reservationAmount: null,
        reservationTime: null,
        expirationTime: null,
      },
    });
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async handleExpiredReservations() {
    const now = new Date();

    // Find reservations where the expiration time has passed and they are still reserved
    const expiredReservations = await this.prisma.mesa.findMany({
      where: {
        estado: 'RESERVADO',
        expirationTime: {
          lt: now,
        },
      },
    });

    if (expiredReservations.length > 0) {
      const releasedReservations: typeof expiredReservations = [];
      for (const mesa of expiredReservations) {
        if (typeof this.prisma.mesa?.updateMany === 'function') {
          const updated = await this.prisma.mesa.updateMany({
            where: {
              id: mesa.id,
              estado: 'RESERVADO',
              expirationTime: { lt: now },
            },
            data: {
              estado: 'DISPONIBLE',
              reservationName: null,
              reservationAmount: null,
              reservationTime: null,
              expirationTime: null,
            },
          });
          if (updated.count > 0) {
            releasedReservations.push(mesa);
            this.logger.log(
              `Reserva caducada para mesa ${mesa.number} de planta ${mesa.floor}. Liberando mesa automáticamente.`,
            );
          }
        } else {
          await this.releaseMesa(mesa.id);
          releasedReservations.push(mesa);
          this.logger.log(
            `Reserva caducada para mesa ${mesa.number} de planta ${mesa.floor}. Liberando mesa automáticamente.`,
          );
        }
      }
      if (releasedReservations.length > 0) {
        await this.systemLogs.createProcess({
          process: 'RESERVATION_EXPIRATION_MONITOR',
          action: 'MESAS_EXPIRED_RESERVATIONS_RELEASED',
          module: 'mesas',
          operation: 'RELEASE',
          entity: 'mesa',
          before: releasedReservations,
          after: {
            releasedIds: releasedReservations.map((mesa) => mesa.id),
            count: releasedReservations.length,
          },
        });
      }
    }
  }
}
