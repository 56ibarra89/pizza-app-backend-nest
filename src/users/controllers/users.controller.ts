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

@ApiTags('users')
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
