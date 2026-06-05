import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AppConfigService } from '../services/app-config.service';
import { UpdateAppConfigDto } from '../dto/update-app-config.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRoleDto } from '../../users/dto/user-role.dto';

@ApiTags('config')
@Roles(UserRoleDto.admin)
@Controller('config')
export class AppConfigController {
  constructor(private readonly service: AppConfigService) {}

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.service.getByIdOrDefault(id);
  }

  @Put(':id')
  upsert(@Param('id') id: string, @Body() dto: UpdateAppConfigDto) {
    return this.service.upsert(id, dto);
  }
}
