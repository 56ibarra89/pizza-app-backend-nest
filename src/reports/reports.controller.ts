import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Permissions, UserRoleDto } from '../common';
import { Roles } from '../common/decorators/roles.decorator';
import { parseBusinessDateInput } from '../common/time/business-time.util';
import { SalesReportQueryDto } from './dto/sales-report-query.dto';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@Controller('reports')
@Permissions('reports.read')
@Roles(UserRoleDto.admin)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('sales')
  getSalesReport(@Query() query: SalesReportQueryDto) {
    let startDate: Date;
    let endDate: Date;
    try {
      startDate = parseBusinessDateInput(query.startDate, 'start');
      endDate = parseBusinessDateInput(query.endDate, 'end');
    } catch {
      throw new BadRequestException('El rango de fechas no es válido.');
    }
    return this.reports.getSalesReport({
      startDate,
      endDate,
      timezoneOffsetMinutes: query.timezoneOffsetMinutes,
    });
  }
}
