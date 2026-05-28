import { Controller, Get, Post, Body, ParseArrayPipe } from '@nestjs/common';
import { MesasService } from './mesas.service';
import { UpdateFloorDto } from './dto/update-floor.dto';

@Controller('mesas')
export class MesasController {
  constructor(private readonly mesasService: MesasService) {}

  @Get('config')
  getFloorsConfig() {
    return this.mesasService.getFloorsConfig();
  }

  @Post('config')
  updateFloorsConfig(
    @Body(new ParseArrayPipe({ items: UpdateFloorDto }))
    floors: UpdateFloorDto[],
  ) {
    return this.mesasService.updateFloorsConfig(floors);
  }

  @Get()
  getMesas() {
    return this.mesasService.getMesas();
  }
}
