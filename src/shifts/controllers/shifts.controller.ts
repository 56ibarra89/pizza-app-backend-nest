import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ShiftsService } from '../services/shifts.service';
import { OpenShiftDto } from '../dto/open-shift.dto';
import { CloseShiftDto } from '../dto/close-shift.dto';
import { ListShiftsQueryDto } from '../dto/list-shifts-query.dto';

@ApiTags('shifts')
@Controller('shifts')
export class ShiftsController {
  constructor(private readonly service: ShiftsService) {}

  @Get('active')
  getActive() {
    return this.service.getActive();
  }

  @Get()
  list(@Query() query: ListShiftsQueryDto) {
    return this.service.list(query);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Post('open')
  open(@Body() dto: OpenShiftDto) {
    return this.service.open(dto);
  }

  @Post(':id/close')
  close(@Param('id') id: string, @Body() dto: CloseShiftDto) {
    return this.service.close(id, dto);
  }
}
