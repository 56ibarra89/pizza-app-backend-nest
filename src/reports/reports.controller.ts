import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Permissions, UserRoleDto } from '../common';
import { Roles } from '../common/decorators/roles.decorator';
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
    return this.reports.getSalesReport({
      startDate: new Date(query.startDate),
      endDate: new Date(query.endDate),
      timezoneOffsetMinutes: query.timezoneOffsetMinutes,
    });
  }
}
