import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions, Roles } from '../common';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { UserRoleDto } from '../users/dto/user-role.dto';
import { AccessControlService } from './access-control.service';
import { CreateAccessRoleDto } from './dto/create-access-role.dto';
import { UpdateAccessRoleDto } from './dto/update-access-role.dto';

@ApiTags('access-control')
@Controller('access-control')
export class AccessControlController {
  constructor(private readonly accessControl: AccessControlService) {}

  @Get('permissions')
  @Roles(UserRoleDto.admin)
  @Permissions('roles.read')
  listPermissions() {
    return this.accessControl.listPermissions();
  }

  @Get('roles')
  @Roles(UserRoleDto.admin)
  @Permissions('roles.read')
  listRoles() {
    return this.accessControl.listRoles();
  }

  @Get('roles/:id')
  @Roles(UserRoleDto.admin)
  @Permissions('roles.read')
  getRole(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.accessControl.getRole(id);
  }

  @Post('roles')
  @Roles(UserRoleDto.admin)
  @Permissions('roles.manage')
  createRole(
    @Body() dto: CreateAccessRoleDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.accessControl.create(dto, actor);
  }

  @Patch('roles/:id')
  @Roles(UserRoleDto.admin)
  @Permissions('roles.manage')
  updateRole(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateAccessRoleDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.accessControl.update(id, dto, actor);
  }

  @Delete('roles/:id')
  @Roles(UserRoleDto.admin)
  @Permissions('roles.manage')
  removeRole(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.accessControl.remove(id, actor);
  }

  @Get('me')
  authorization(@CurrentUser() user: AuthenticatedUser) {
    return this.accessControl.authorizationForUser(user.id);
  }
}
