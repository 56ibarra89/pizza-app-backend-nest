import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SystemLogsService } from '../services/system-logs.service';
import { CreateSystemLogDto } from '../dto/create-system-log.dto';
import { GetSystemLogsQueryDto } from '../dto/get-system-logs-query.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRoleDto } from '../../users/dto/user-role.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';

@ApiTags('system-logs')
@Controller('system-logs')
export class SystemLogsController {
  constructor(private readonly service: SystemLogsService) {}

  @Get()
  @Roles(UserRoleDto.admin)
  getMany(@Query() query: GetSystemLogsQueryDto) {
    return this.service.getMany(query);
  }

  @Post()
  create(
    @Body() dto: CreateSystemLogDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.create(dto, user);
  }
}
