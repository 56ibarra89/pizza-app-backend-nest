import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CashExpensesService } from '../services/cash-expenses.service';
import { CreateCashExpenseDto } from '../dto/create-cash-expense.dto';
import { ListCashExpensesQueryDto } from '../dto/list-cash-expenses-query.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRoleDto } from '../../users/dto/user-role.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';

@ApiTags('cash-expenses')
@Controller('cash-expenses')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRoleDto.admin, UserRoleDto.cajero_principal, UserRoleDto.cajero)
export class CashExpensesController {
  constructor(private readonly expensesService: CashExpensesService) {}

  @Post()
  async create(
    @Body() dto: CreateCashExpenseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.expensesService.create(dto, user);
  }

  @Get()
  async list(@Query() query: ListCashExpensesQueryDto) {
    return this.expensesService.list(query);
  }

  @Get('shift/:shiftId')
  async listByShift(@Param('shiftId') shiftId: string) {
    return this.expensesService.listByShiftId(shiftId);
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.expensesService.getById(id);
  }
}
