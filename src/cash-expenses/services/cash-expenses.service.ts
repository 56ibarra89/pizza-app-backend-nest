import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ShiftStatus } from '@prisma/client';
import {
  CASH_EXPENSES_REPOSITORY,
  type ICashExpensesRepository,
} from '../interfaces/cash-expenses.repository';
import { CreateCashExpenseDto } from '../dto/create-cash-expense.dto';
import { ListCashExpensesQueryDto } from '../dto/list-cash-expenses-query.dto';
import { ShiftsService } from '../../shifts/services/shifts.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { CashExpenseEntity } from '../entities/cash-expense.entity';
import { AppConfigService } from '../../app-config/services/app-config.service';
import {
  USERS_REPOSITORY,
  type IUsersRepository,
} from '../../users/interfaces/users.repository';
import { UserRoleDto } from '../../users/dto/user-role.dto';
import { CashExpenseCategoryDto } from '../dto/cash-expense-category.dto';

const PETTY_CASH_POLICY_KEY = 'petty_cash_policy';

interface CategoryPolicy {
  enabled: boolean;
  requiresPin: boolean;
}

interface PettyCashPolicy {
  maxAmountWithoutAuth: number;
  maxShiftTotal: number;
  requireVoucherOver: number;
  requireVoucherAlways: boolean;
  categoryPolicies: Partial<Record<CashExpenseCategoryDto, CategoryPolicy>>;
}

const DEFAULT_POLICY: PettyCashPolicy = {
  maxAmountWithoutAuth: 250,
  maxShiftTotal: 1500,
  requireVoucherOver: 100,
  requireVoucherAlways: false,
  categoryPolicies: {
    [CashExpenseCategoryDto.PAGO_PROVEEDOR]: {
      enabled: true,
      requiresPin: true,
    },
    [CashExpenseCategoryDto.ADELANTO_SUELDO]: {
      enabled: true,
      requiresPin: true,
    },
  },
};

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}

function readPolicy(data: unknown): PettyCashPolicy {
  if (typeof data !== 'object' || data === null) return DEFAULT_POLICY;
  const source = data as Record<string, unknown>;
  const rawCategories =
    typeof source.categoryPolicies === 'object' &&
    source.categoryPolicies !== null
      ? (source.categoryPolicies as Record<string, unknown>)
      : {};
  const categoryPolicies: PettyCashPolicy['categoryPolicies'] = {};

  for (const category of Object.values(CashExpenseCategoryDto)) {
    const raw = rawCategories[category];
    const defaults = DEFAULT_POLICY.categoryPolicies[category] ?? {
      enabled: true,
      requiresPin: false,
    };
    if (typeof raw !== 'object' || raw === null) {
      categoryPolicies[category] = defaults;
      continue;
    }
    const candidate = raw as Record<string, unknown>;
    categoryPolicies[category] = {
      enabled:
        typeof candidate.enabled === 'boolean'
          ? candidate.enabled
          : defaults.enabled,
      requiresPin:
        typeof candidate.requiresPin === 'boolean'
          ? candidate.requiresPin
          : defaults.requiresPin,
    };
  }

  return {
    maxAmountWithoutAuth: readNumber(
      source.maxAmountWithoutAuth,
      DEFAULT_POLICY.maxAmountWithoutAuth,
    ),
    maxShiftTotal: readNumber(
      source.maxShiftTotal,
      DEFAULT_POLICY.maxShiftTotal,
    ),
    requireVoucherOver: readNumber(
      source.requireVoucherOver,
      DEFAULT_POLICY.requireVoucherOver,
    ),
    requireVoucherAlways:
      typeof source.requireVoucherAlways === 'boolean'
        ? source.requireVoucherAlways
        : DEFAULT_POLICY.requireVoucherAlways,
    categoryPolicies,
  };
}

@Injectable()
export class CashExpensesService {
  constructor(
    @Inject(CASH_EXPENSES_REPOSITORY)
    private readonly repo: ICashExpensesRepository,
    private readonly shiftsService: ShiftsService,
    private readonly configService: AppConfigService,
    @Inject(USERS_REPOSITORY)
    private readonly usersRepository: IUsersRepository,
  ) {}

  async create(
    dto: CreateCashExpenseDto,
    user: AuthenticatedUser,
  ): Promise<CashExpenseEntity> {
    let targetShiftId = dto.shiftId;

    if (!targetShiftId) {
      const activeShift = await this.shiftsService.getActive();
      if (!activeShift) {
        throw new BadRequestException(
          'Debes tener un turno de caja abierto para registrar un gasto.',
        );
      }
      targetShiftId = activeShift.id;
    }

    const shift = await this.shiftsService.getById(targetShiftId);
    if (shift.status !== ShiftStatus.OPEN) {
      throw new BadRequestException(
        'Solo se pueden registrar gastos en un turno que esté actualmente abierto.',
      );
    }

    const config = await this.configService.getByIdOrDefault(
      PETTY_CASH_POLICY_KEY,
    );
    const policy = readPolicy(config.data);
    const categoryPolicy = policy.categoryPolicies[dto.category] ?? {
      enabled: true,
      requiresPin: false,
    };
    if (!categoryPolicy.enabled) {
      throw new BadRequestException(
        'La categoría seleccionada está deshabilitada por la política de caja chica.',
      );
    }

    const voucherRequired =
      policy.requireVoucherAlways ||
      (policy.requireVoucherOver > 0 &&
        dto.amount >= policy.requireVoucherOver);
    if (voucherRequired && !dto.voucherNumber?.trim()) {
      throw new BadRequestException(
        'La política de caja chica exige un número de comprobante para este gasto.',
      );
    }

    const currentShiftTotal =
      await this.repo.getTotalExpensesByShiftId(targetShiftId);
    const requiresAuthorization =
      categoryPolicy.requiresPin ||
      (policy.maxAmountWithoutAuth > 0 &&
        dto.amount > policy.maxAmountWithoutAuth) ||
      (policy.maxShiftTotal > 0 &&
        currentShiftTotal + dto.amount > policy.maxShiftTotal);

    if (requiresAuthorization) {
      if (!dto.authorizationPin) {
        throw new BadRequestException(
          'Este gasto requiere autorización con PIN de administrador.',
        );
      }
      const authorizer = await this.usersRepository.findByPin(
        dto.authorizationPin,
        {
          allowedRoles: [UserRoleDto.admin],
          attemptScope: 'cash-expense-authorization',
        },
      );
      if (!authorizer) {
        throw new BadRequestException(
          'El PIN de autorización no pertenece a un administrador activo.',
        );
      }
    }

    const cashierSnapshotName = user.username || 'Cajero';

    return this.repo.create({
      shiftId: targetShiftId,
      amount: dto.amount,
      category: dto.category,
      reason: dto.reason.trim(),
      voucherNumber: dto.voucherNumber?.trim() || undefined,
      notes: dto.notes?.trim() || undefined,
      cashierId: user.id,
      cashierSnapshotName,
    });
  }

  async list(query: ListCashExpensesQueryDto): Promise<CashExpenseEntity[]> {
    const from = query.startDate ? new Date(query.startDate) : undefined;
    const to = query.endDate ? new Date(query.endDate) : undefined;

    return this.repo.list({
      shiftId: query.shiftId,
      cashierId: query.cashierId,
      category: query.category,
      from,
      to,
    });
  }

  async listByShiftId(shiftId: string): Promise<CashExpenseEntity[]> {
    return this.repo.listByShiftId(shiftId);
  }

  async getById(id: string): Promise<CashExpenseEntity> {
    const found = await this.repo.findById(id);
    if (!found) {
      throw new NotFoundException('Gasto no encontrado');
    }
    return found;
  }
}
