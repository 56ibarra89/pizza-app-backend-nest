import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Put,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AppConfigService } from '../services/app-config.service';
import { UpdateAppConfigDto } from '../dto/update-app-config.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, Permissions, UserRoleDto } from '../../common';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';

@ApiTags('config')
@Roles(UserRoleDto.admin)
@Controller('config')
export class AppConfigController {
  constructor(private readonly service: AppConfigService) {}

  @Get(':id')
  @Permissions('settings.read')
  @Roles(
    UserRoleDto.admin,
    UserRoleDto.cajero,
    UserRoleDto.cajero_principal,
    UserRoleDto.mesero,
    UserRoleDto.cocinero,
    UserRoleDto.despachador,
    UserRoleDto.motorizado,
  )
  getById(@Param('id') id: string) {
    return this.service.getByIdOrDefault(id);
  }

  @Put(':id')
  @Permissions('settings.manage')
  @Roles(UserRoleDto.admin)
  upsert(
    @Param('id') id: string,
    @Body() dto: UpdateAppConfigDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    if (id === 'floors_config') {
      throw new BadRequestException(
        'Usa el endpoint /mesas/floors para actualizar la configuración de plantas y mesas.',
      );
    }
    return this.service.upsert(id, dto, user?.id);
  }
}
