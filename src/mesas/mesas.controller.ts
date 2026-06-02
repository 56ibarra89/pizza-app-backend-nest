import { Controller, Get, Post, Body, ParseArrayPipe, Patch, Param } from '@nestjs/common';
import { MesasService } from './mesas.service';
import { UpdateFloorDto } from './dto/update-floor.dto';
import { UpdateMesaStatusDto } from './dto/update-mesa-status.dto';
import { ReserveMesaDto } from './dto/reserve-mesa.dto';

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

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateMesaStatusDto,
  ) {
    return this.mesasService.updateStatus(id, dto.estado);
  }

  @Patch(':id/reserve')
  reserveMesa(
    @Param('id') id: string,
    @Body() dto: ReserveMesaDto,
  ) {
    return this.mesasService.reserveMesa(id, dto);
  }

  @Patch(':id/release')
  releaseMesa(@Param('id') id: string) {
    return this.mesasService.releaseMesa(id);
  }
}
