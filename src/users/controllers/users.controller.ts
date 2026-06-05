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
import { UsersService } from '../services/users.service';
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { toUserResponseDto } from '../mappers/users.mapper';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRoleDto } from '../dto/user-role.dto';

@ApiTags('users')
@Roles(UserRoleDto.admin)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  async getAll() {
    const list = await this.users.getAll();
    return list.map(toUserResponseDto);
  }

  @Get(':id')
  async getById(@Param('id', new ParseUUIDPipe()) id: string) {
    const user = await this.users.getById(id);
    return toUserResponseDto(user);
  }

  @Get('username/:username')
  async getByUsername(@Param('username') username: string) {
    const user = await this.users.getByUsername(username);
    return toUserResponseDto(user);
  }

  @Post()
  async create(@Body() dto: CreateUserDto) {
    const created = await this.users.create(dto);
    return toUserResponseDto(created);
  }

  @Patch(':id')
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    const updated = await this.users.update(id, dto);
    return toUserResponseDto(updated);
  }

  @Delete(':id')
  delete(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.users.delete(id);
  }
}
