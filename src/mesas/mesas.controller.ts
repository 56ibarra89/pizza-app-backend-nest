import { Controller, Get, Post, Body, ParseArrayPipe, Patch, Param } from '@nestjs/common';
import { MesasService } from './mesas.service';
import { UpdateFloorDto } from './dto/update-floor.dto';
import { UpdateMesaStatusDto } from './dto/update-mesa-status.dto';
import { ReserveMesaDto } from './dto/reserve-mesa.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Permissions, UserRoleDto } from '../common';

@Controller('mesas')
export class MesasController {
  constructor(private readonly mesasService: MesasService) {}

  @Get('config')
  @Permissions('tables.read')
  getFloorsConfig() {
    return this.mesasService.getFloorsConfig();
  }

  @Post('config')
  @Permissions('tables.configure')
  @Roles(UserRoleDto.admin)
  updateFloorsConfig(
    @Body(new ParseArrayPipe({ items: UpdateFloorDto }))
    floors: UpdateFloorDto[],
  ) {
    return this.mesasService.updateFloorsConfig(floors);
  }

  @Get()
  @Permissions('tables.read')
  getMesas() {
    return this.mesasService.getMesas();
  }

  @Patch(':id/status')
  @Permissions('tables.operate')
  @Roles(
    UserRoleDto.admin,
    UserRoleDto.cajero,
    UserRoleDto.cajero_principal,
    UserRoleDto.mesero,
    UserRoleDto.despachador,
  )
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateMesaStatusDto,
  ) {
    return this.mesasService.updateStatus(id, dto.estado);
  }

  @Patch(':id/reserve')
  @Permissions('tables.operate')
  @Roles(
    UserRoleDto.admin,
    UserRoleDto.cajero,
    UserRoleDto.cajero_principal,
    UserRoleDto.mesero,
    UserRoleDto.despachador,
  )
  reserveMesa(
    @Param('id') id: string,
    @Body() dto: ReserveMesaDto,
  ) {
    return this.mesasService.reserveMesa(id, dto);
  }

  @Patch(':id/release')
  @Permissions('tables.operate')
  @Roles(
    UserRoleDto.admin,
    UserRoleDto.cajero,
    UserRoleDto.cajero_principal,
    UserRoleDto.mesero,
    UserRoleDto.despachador,
  )
  releaseMesa(@Param('id') id: string) {
    return this.mesasService.releaseMesa(id);
  }
}
