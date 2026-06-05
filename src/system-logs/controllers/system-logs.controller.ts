import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SystemLogsService } from '../services/system-logs.service';
import { CreateSystemLogDto } from '../dto/create-system-log.dto';
import { GetSystemLogsQueryDto } from '../dto/get-system-logs-query.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRoleDto } from '../../users/dto/user-role.dto';

@ApiTags('system-logs')
@Roles(UserRoleDto.admin)
@Controller('system-logs')
export class SystemLogsController {
  constructor(private readonly service: SystemLogsService) {}

  @Get()
  getMany(@Query() query: GetSystemLogsQueryDto) {
    return this.service.getMany(query);
  }

  @Post()
  create(@Body() dto: CreateSystemLogDto) {
    return this.service.create(dto);
  }
}
