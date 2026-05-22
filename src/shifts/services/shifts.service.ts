import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ShiftStatus } from '@prisma/client';
import {
  SHIFTS_REPOSITORY,
  type IShiftsRepository,
} from '../interfaces/shifts.repository';
import type { OpenShiftDto } from '../dto/open-shift.dto';
import type { CloseShiftDto } from '../dto/close-shift.dto';
import type { ListShiftsQueryDto } from '../dto/list-shifts-query.dto';

@Injectable()
export class ShiftsService {
  constructor(@Inject(SHIFTS_REPOSITORY) private readonly repo: IShiftsRepository) {}

  async getActive() {
    return this.repo.findActive();
  }

  async getById(id: string) {
    const found = await this.repo.findById(id);
    if (!found) throw new NotFoundException('Turno no encontrado');
    return found;
  }

  list(query: ListShiftsQueryDto) {
    const limit = query.limit ?? 200;
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    return this.repo.list({ limit, status: query.status, from, to });
  }

  async open(dto: OpenShiftDto) {
    const existing = await this.repo.findActive();
    if (existing) {
      throw new BadRequestException('Ya existe un turno abierto');
    }

    const cashierName = dto.cashierName.trim();
    if (!cashierName) throw new BadRequestException('cashierName es requerido');

    return this.repo.open({
      cashierId: dto.cashierId,
      cashierName,
      cashRegisterName: dto.cashRegisterName?.trim() || undefined,
      openingAmount: dto.openingAmount,
      notes: dto.notes?.trim() || undefined,
      startTime: new Date(),
    });
  }

  async close(id: string, dto: CloseShiftDto) {
    const shift = await this.getById(id);
    if (shift.status !== ShiftStatus.OPEN) {
      throw new BadRequestException('Solo se puede cerrar un turno abierto');
    }

    return this.repo.close({
      id,
      endTime: new Date(),
      closingAmount: dto.closingAmount,
      notes: dto.notes?.trim() || undefined,
    });
  }
}
