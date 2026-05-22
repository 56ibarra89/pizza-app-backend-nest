import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { CorrelativosService } from '../services/correlativos.service';
import { CreateCorrelativoDto } from '../dto/create-correlativo.dto';
import { ConsumeCorrelativoDto } from '../dto/consume-correlativo.dto';
import { GetActiveCorrelativoQueryDto } from '../dto/get-active-correlativo-query.dto';

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

  @Post('next')
  consumeNext(@Body() dto: ConsumeCorrelativoDto) {
    return this.service.consumeNext(dto.documentType);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.service.deleteById(id);
  }
}
