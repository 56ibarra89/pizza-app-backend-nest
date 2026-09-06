import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DevicesService } from './devices.service';
import { PrinterConfigDto } from './dto/printer-config.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRoleDto } from '../users/dto/user-role.dto';

@ApiTags('devices')
@Controller('devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Get('printers')
  @Roles(
    UserRoleDto.admin,
    UserRoleDto.cajero,
    UserRoleDto.cajero_principal,
    UserRoleDto.mesero,
    UserRoleDto.cocinero,
    UserRoleDto.despachador,
  )
  getPrinters(): Promise<PrinterConfigDto[]> {
    return this.devicesService.getPrinters();
  }

  @Post('printers')
  @Roles(UserRoleDto.admin, UserRoleDto.cajero_principal)
  savePrinter(@Body() dto: PrinterConfigDto): Promise<PrinterConfigDto> {
    return this.devicesService.savePrinter(dto);
  }

  @Delete('printers/:id')
  @Roles(UserRoleDto.admin, UserRoleDto.cajero_principal)
  deletePrinter(@Param('id') id: string): Promise<void> {
    return this.devicesService.deletePrinter(id);
  }

  @Get()
  @Roles(
    UserRoleDto.admin,
    UserRoleDto.cajero,
    UserRoleDto.cajero_principal,
    UserRoleDto.mesero,
  )
  getDevices(): Promise<any[]> {
    return this.devicesService.getLegacyDevices();
  }

  @Post('scan')
  @Roles(UserRoleDto.admin, UserRoleDto.cajero_principal)
  scan(): { success: boolean; message: string } {
    return {
      success: true,
      message: 'Escaneo de periféricos completado',
    };
  }
}
