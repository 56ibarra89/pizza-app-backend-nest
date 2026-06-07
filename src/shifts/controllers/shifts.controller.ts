import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ShiftsService } from '../services/shifts.service';
import { OpenShiftDto } from '../dto/open-shift.dto';
import { CloseShiftDto } from '../dto/close-shift.dto';
import { ListShiftsQueryDto } from '../dto/list-shifts-query.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRoleDto } from '../../users/dto/user-role.dto';

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
  @Roles(UserRoleDto.admin, UserRoleDto.cajero)
  open(@Body() dto: OpenShiftDto) {
    return this.service.open(dto);
  }

  @Post(':id/close')
  @Roles(UserRoleDto.admin, UserRoleDto.cajero)
  close(@Param('id') id: string, @Body() dto: CloseShiftDto, @CurrentUser() user: any) {
    return this.service.close(id, dto, user);
  }
}
