import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ShiftStatus } from '@prisma/client';
import {
  SHIFTS_REPOSITORY,
  type IShiftsRepository,
} from '../interfaces/shifts.repository';
import type { OpenShiftDto } from '../dto/open-shift.dto';
import type { CloseShiftDto } from '../dto/close-shift.dto';
import type { ListShiftsQueryDto } from '../dto/list-shifts-query.dto';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { UserRoleDto } from '../../users/dto/user-role.dto';

const DEFAULT_DISCREPANCY_THRESHOLD = 0;

@Injectable()
export class ShiftsService {
  constructor(
    @Inject(SHIFTS_REPOSITORY) private readonly repo: IShiftsRepository,
  ) {}

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

  async open(dto: OpenShiftDto, user: AuthenticatedUser) {
    const existing = await this.repo.findActive();
    if (existing) {
      throw new BadRequestException('Ya existe un turno abierto');
    }

    return this.repo.open({
      cashierId: user.id,
      cashierSnapshotName: user.username,
      cashRegisterSnapshotName: dto.cashRegisterName?.trim() || undefined,
      openingAmount: dto.openingAmount,
      notes: dto.notes?.trim() || undefined,
      startTime: new Date(),
    });
  }

  async close(id: string, dto: CloseShiftDto, user: AuthenticatedUser) {
    const shift = await this.getById(id);
    this.assertCanCloseShift(shift, user);

    return this.repo.close({
      id,
      endTime: new Date(),
      closingAmount: dto.closingAmount,
      declaredCardAmount: dto.declaredCardAmount,
      declaredAppAmount: dto.declaredAppAmount,
      notes: dto.notes?.trim() || undefined,
      discrepancyReason: dto.discrepancyReason?.trim() || undefined,
      authorizationPin: dto.authorizationPin,
      denominationBreakdown: dto.denominationBreakdown,
      actor: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
    });
  }

  async getClosePreview(
    id: string,
    user: AuthenticatedUser,
    query?: {
      countedCash?: number;
      countedCard?: number;
      countedApp?: number;
    },
  ) {
    const shift = await this.getById(id);
    this.assertCanCloseShift(shift, user);
    const preview = await this.repo.getClosePreview({ id });

    let requiresAuthorization: boolean | undefined = undefined;
    if (
      query?.countedCash !== undefined ||
      query?.countedCard !== undefined ||
      query?.countedApp !== undefined
    ) {
      const cashDiff =
        query.countedCash !== undefined
          ? Math.round(Math.abs(query.countedCash - preview.expectedCash) * 100)
          : 0;
      const cardDiff =
        query.countedCard !== undefined
          ? Math.round(Math.abs(query.countedCard - preview.sales.card) * 100)
          : 0;
      const appDiff =
        query.countedApp !== undefined
          ? Math.round(Math.abs(query.countedApp - preview.sales.app) * 100)
          : 0;

      requiresAuthorization = cashDiff > 0 || cardDiff > 0 || appDiff > 0;
    }

    return {
      shiftId: preview.shiftId,
      discrepancyThreshold: DEFAULT_DISCREPANCY_THRESHOLD,
      blockingOrders: preview.blockingOrders,
      blockingTables: preview.blockingTables,
      canClose: preview.canClose,
      requiresAuthorization,
    };
  }

  async assertCanTerminateSession(user: AuthenticatedUser): Promise<void> {
    if (user.role !== UserRoleDto.cajero_principal) return;

    const activeShift = await this.repo.findActiveForCashier({
      cashierId: user.id,
      cashierSnapshotName: user.username,
    });
    if (activeShift) {
      throw new ForbiddenException(
        'No puedes cerrar sesión porque tu caja está abierta. Debes cerrar la caja primero.',
      );
    }
  }

  private assertCanCloseShift(
    shift: Awaited<ReturnType<ShiftsService['getById']>>,
    user: AuthenticatedUser,
  ): void {
    if (shift.status !== ShiftStatus.OPEN) {
      throw new BadRequestException('Solo se puede cerrar un turno abierto');
    }
    if (user.role === UserRoleDto.admin) return;

    const belongsToAnotherCashier = shift.cashierId
      ? user.id !== shift.cashierId
      : user.username !== shift.cashierSnapshotName;
    if (belongsToAnotherCashier) {
      throw new ForbiddenException(
        'No puedes cerrar un turno que fue abierto por otro cajero',
      );
    }
  }
}
