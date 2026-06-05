import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CorrelativosService } from '../services/correlativos.service';
import { CreateCorrelativoDto } from '../dto/create-correlativo.dto';
import { ConsumeCorrelativoDto } from '../dto/consume-correlativo.dto';
import { GetActiveCorrelativoQueryDto } from '../dto/get-active-correlativo-query.dto';
import { UpdateCorrelativoDto } from '../dto/update-correlativo.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRoleDto } from '../../users/dto/user-role.dto';

@ApiTags('correlativos')
@Roles(UserRoleDto.admin)
@Controller('correlativos')
export class CorrelativosController {
  constructor(private readonly service: CorrelativosService) {}

  @Get()
  getAll() {
    return this.service.getAll();
  }

  @Get('active')
  getActive(@Query() query: GetActiveCorrelativoQueryDto) {
    return this.service.getActive(query.documentType);
  }

  @Post()
  create(@Body() dto: CreateCorrelativoDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCorrelativoDto) {
    return this.service.update(id, dto);
  }

  @Post('next')
  consumeNext(@Body() dto: ConsumeCorrelativoDto) {
    return this.service.consumeNext(dto.documentType);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.service.deleteById(id);
  }
}
