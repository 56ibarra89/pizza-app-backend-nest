import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AdminDashboardService } from '../services/admin-dashboard.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRoleDto } from '../../common';
import type {
  ActiveCashRegisterDto,
  WaiterPerformanceDto,
  LiveKpisDto,
} from '../dto/admin-dashboard.dto';

@ApiTags('admin-dashboard')
@Roles(UserRoleDto.admin, UserRoleDto.cajero_principal)
@Controller('admin/dashboard')
export class AdminDashboardController {
  constructor(private readonly dashboardService: AdminDashboardService) {}

  @Get('cajas-activas')
  async getActiveCashRegisters(): Promise<ActiveCashRegisterDto[]> {
    return this.dashboardService.getActiveCashRegisters();
  }

  @Get('rendimiento-meseros')
  async getWaiterPerformance(): Promise<WaiterPerformanceDto[]> {
    return this.dashboardService.getWaiterPerformance();
  }

  @Get('live-kpis')
  async getLiveKpis(): Promise<LiveKpisDto> {
    return this.dashboardService.getLiveKpis();
  }
}
