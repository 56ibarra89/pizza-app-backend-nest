import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ShiftsService } from '../services/shifts.service';
import { OpenShiftDto } from '../dto/open-shift.dto';
import { CloseShiftDto } from '../dto/close-shift.dto';
import { ListShiftsQueryDto } from '../dto/list-shifts-query.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRoleDto } from '../../users/dto/user-role.dto';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { CloseShiftPreviewQueryDto } from '../dto/close-shift-preview-query.dto';

@ApiTags('shifts')
@Controller('shifts')
export class ShiftsController {
  constructor(private readonly service: ShiftsService) {}

  @Get('active')
  getActive(@CurrentUser() user?: AuthenticatedUser) {
    return this.service.getActive(user);
  }

  @Get()
  list(@Query() query: ListShiftsQueryDto) {
    return this.service.list(query);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Get(':id/close-preview')
  @Roles(
    UserRoleDto.admin,
    UserRoleDto.cajero_principal,
    UserRoleDto.cajero,
    UserRoleDto.despachador,
  )
  getClosePreview(
    @Param('id') id: string,
    @Query() query: CloseShiftPreviewQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.getClosePreview(id, user, query);
  }

  @Post('open')
  @Roles(
    UserRoleDto.admin,
    UserRoleDto.cajero_principal,
    UserRoleDto.cajero,
    UserRoleDto.despachador,
  )
  open(@Body() dto: OpenShiftDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.open(dto, user);
  }

  @Post(':id/close')
  @Roles(
    UserRoleDto.admin,
    UserRoleDto.cajero_principal,
    UserRoleDto.cajero,
    UserRoleDto.despachador,
  )
  close(
    @Param('id') id: string,
    @Body() dto: CloseShiftDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.close(id, dto, user);
  }
}
