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
import { AppConfigService } from '../../app-config/services/app-config.service';

const DEFAULT_DISCREPANCY_THRESHOLD = 100;

@Injectable()
export class ShiftsService {
  constructor(
    @Inject(SHIFTS_REPOSITORY) private readonly repo: IShiftsRepository,
    private readonly appConfigService: AppConfigService,
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
    const { discrepancyThreshold } = await this.getCloseSettings();

    return this.repo.close({
      id,
      endTime: new Date(),
      closingAmount: dto.closingAmount,
      notes: dto.notes?.trim() || undefined,
      discrepancyReason: dto.discrepancyReason?.trim() || undefined,
      authorizationPin: dto.authorizationPin,
      denominationBreakdown: dto.denominationBreakdown,
      discrepancyThreshold,
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
    countedCash?: number,
  ) {
    const shift = await this.getById(id);
    this.assertCanCloseShift(shift, user);
    const { blindCashCount, discrepancyThreshold } =
      await this.getCloseSettings();
    const preview = await this.repo.getClosePreview({
      id,
      discrepancyThreshold,
    });

    if (blindCashCount && countedCash === undefined) {
      return {
        shiftId: preview.shiftId,
        discrepancyThreshold: preview.discrepancyThreshold,
        blockingOrders: preview.blockingOrders,
        blockingTables: preview.blockingTables,
        canClose: preview.canClose,
        financialsRevealed: false,
      };
    }
    return { ...preview, financialsRevealed: true };
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

  private async getCloseSettings(): Promise<{
    blindCashCount: boolean;
    discrepancyThreshold: number;
  }> {
    const config =
      await this.appConfigService.getByIdOrDefault('general_config');
    if (typeof config.data !== 'object' || config.data === null) {
      return {
        blindCashCount: false,
        discrepancyThreshold: DEFAULT_DISCREPANCY_THRESHOLD,
      };
    }
    const data = config.data as Record<string, unknown>;
    const threshold = data['cashDiscrepancyThreshold'];
    return {
      blindCashCount: data['blindCashCount'] === true,
      discrepancyThreshold:
        typeof threshold === 'number' &&
        Number.isFinite(threshold) &&
        threshold >= 0
          ? threshold
          : DEFAULT_DISCREPANCY_THRESHOLD,
    };
  }
}
