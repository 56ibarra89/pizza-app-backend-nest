import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRoleDto } from '../../users/dto/user-role.dto';
import { CreateCertificadoDto } from '../dto/certificados/create-certificado.dto';
import { RedeemCertificadoDto } from '../dto/certificados/redeem-certificado.dto';
import { CertificatePromotionsService } from '../services/certificate-promotions.service';

@ApiTags('promotions')
@Controller('promotions/certificates')
export class CertificatesController {
  constructor(private readonly certificates: CertificatePromotionsService) {}

  @Get()
  list() {
    return this.certificates.list();
  }

  @Get(':serial')
  findBySerial(@Param('serial') serial: string) {
    return this.certificates.findBySerial(serial);
  }

  @Post()
  @Roles(UserRoleDto.admin)
  create(@Body() dto: CreateCertificadoDto) {
    return this.certificates.create(dto);
  }

  @Post(':id/deliver')
  @Roles(UserRoleDto.admin, UserRoleDto.cajero)
  markDelivered(@Param('id', ParseIntPipe) id: number) {
    return this.certificates.markDelivered(id);
  }

  @Post(':id/cancel')
  @Roles(UserRoleDto.admin)
  cancel(@Param('id', ParseIntPipe) id: number) {
    return this.certificates.cancel(id);
  }

  @Delete(':id')
  @Roles(UserRoleDto.admin)
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.certificates.delete(id);
  }

  @Post('redeem')
  @Roles(UserRoleDto.admin, UserRoleDto.cajero)
  redeem(@Body() dto: RedeemCertificadoDto) {
    return this.certificates.redeem(dto);
  }
}
