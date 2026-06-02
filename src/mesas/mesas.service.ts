import { Injectable, BadRequestException, OnModuleInit, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Prisma, MesaEstado } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../app-config/services/app-config.service';
import { UpdateFloorDto } from './dto/update-floor.dto';
import { ReserveMesaDto } from './dto/reserve-mesa.dto';

const FLOORS_CONFIG_KEY = 'floors_config';

const DEFAULT_FLOORS: UpdateFloorDto[] = [
  { id: 1, name: "Primera Planta", tableCount: 0 },
  { id: 2, name: "Segunda Planta", tableCount: 0 },
  { id: 3, name: "Tercera Planta", tableCount: 0 },
  { id: 4, name: "Cuarta Planta", tableCount: 0 },
  { id: 5, name: "Quinta Planta", tableCount: 0 },
  { id: 6, name: "Sexta Planta", tableCount: 0 },
  { id: 7, name: "Séptima Planta", tableCount: 0 },
  { id: 8, name: "Octava Planta", tableCount: 0 },
];

@Injectable()
export class MesasService implements OnModuleInit {
  private readonly logger = new Logger(MesasService.name);

  constructor(
    private prisma: PrismaService,
    private appConfigService: AppConfigService,
  ) {}

  async onModuleInit() {
    const tableCount = await this.prisma.mesa.count();
    if (tableCount === 0) {
      await this.updateFloorsConfig(DEFAULT_FLOORS);
    }
  }

  async getFloorsConfig() {
    const config = await this.appConfigService.getByIdOrDefault(FLOORS_CONFIG_KEY);
    if (!config.data || (!Array.isArray(config.data) && Object.keys(config.data).length === 0)) {
      return DEFAULT_FLOORS;
    }
    return config.data as UpdateFloorDto[];
  }

  async updateFloorsConfig(floors: UpdateFloorDto[]) {
    const oldConfig = await this.getFloorsConfig();
    const newFloorIds = floors.map(f => f.id);
    const removedFloors = oldConfig.filter(f => !newFloorIds.includes(f.id));

    // Validar y borrar mesas de plantas eliminadas
    for (const removedFloor of removedFloors) {
      const mesas = await this.prisma.mesa.findMany({ where: { floor: removedFloor.id } });
      for (const t of mesas) {
        if (t.estado !== 'DISPONIBLE') {
          throw new BadRequestException(`No se puede eliminar la planta "${removedFloor.name}" porque tiene la mesa ${t.number} ocupada.`);
        }
        const linkedOrders = await this.prisma.orderTable.count({ where: { tableId: t.id } });
        if (linkedOrders > 0) {
          throw new BadRequestException(`No se puede eliminar la planta "${removedFloor.name}" porque la mesa ${t.number} tiene historial de pedidos. En su lugar, ajusta el número de mesas a 0 para ocultarla.`);
        }
      }
      if (mesas.length > 0) {
        await this.prisma.mesa.deleteMany({ where: { floor: removedFloor.id } });
      }
    }

    // Save to AppConfig
    await this.appConfigService.upsert(FLOORS_CONFIG_KEY, { data: floors });

    // Sync Prisma Mesa table
    for (const floor of floors) {
      const existingMesas = await this.prisma.mesa.findMany({
        where: { floor: floor.id },
        orderBy: { number: 'asc' },
      });

      const currentCount = existingMesas.length;

      if (floor.tableCount > currentCount) {
        // Create missing tables
        const toCreate: Prisma.MesaCreateManyInput[] = [];
        for (let i = currentCount + 1; i <= floor.tableCount; i++) {
          toCreate.push({
            id: `F${floor.id}-M${i}`,
            floor: floor.id,
            number: i,
            estado: 'DISPONIBLE' as const,
          });
        }
        await this.prisma.mesa.createMany({ data: toCreate });
      } else if (floor.tableCount < currentCount) {
        // Delete excess tables
        const tablesToDelete = existingMesas.filter(m => m.number > floor.tableCount);
        for (const t of tablesToDelete) {
          if (t.estado !== 'DISPONIBLE') {
            throw new BadRequestException(`No se puede eliminar la mesa ${t.number} de la planta "${floor.name}" porque no está disponible.`);
          }
          const linkedOrders = await this.prisma.orderTable.count({ where: { tableId: t.id } });
          if (linkedOrders > 0) {
            throw new BadRequestException(`No se puede eliminar la mesa ${t.number} de la planta "${floor.name}" porque tiene historial de pedidos. En su lugar, ajusta el número de mesas a 0 o déjala intacta para no romper reportes antiguos.`);
          }
        }
        await this.prisma.mesa.deleteMany({
          where: {
            id: { in: tablesToDelete.map(t => t.id) }
          }
        });
      }
    }

    return floors;
  }

  async getMesas() {
    return this.prisma.mesa.findMany({
      orderBy: [
        { floor: 'asc' },
        { number: 'asc' }
      ]
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
      throw new BadRequestException(`La mesa ${id} no está disponible para reservar.`);
    }

    return this.prisma.mesa.update({
      where: { id },
      data: {
        estado: 'RESERVADO',
        reservationName: dto.reservationName,
        reservationAmount: dto.reservationAmount,
        reservationTime: dto.reservationTime ? new Date(dto.reservationTime) : null,
        expirationTime: dto.expirationTime ? new Date(dto.expirationTime) : null,
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
      for (const mesa of expiredReservations) {
        await this.releaseMesa(mesa.id);
        this.logger.log(`Reserva caducada para mesa ${mesa.number} de planta ${mesa.floor}. Liberando mesa automáticamente.`);
      }
    }
  }
}
