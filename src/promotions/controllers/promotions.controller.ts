import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PromotionsService } from '../services/promotions.service';
import { CreateHappyHourDto } from '../dto/happy-hours/create-happy-hour.dto';
import { UpdateHappyHourDto } from '../dto/happy-hours/update-happy-hour.dto';
import { CreateDiscountDto } from '../dto/discounts/create-discount.dto';
import { UpdateDiscountDto } from '../dto/discounts/update-discount.dto';
import { CreateCuponDto } from '../dto/cupones/create-cupon.dto';
import { UpdateCuponDto } from '../dto/cupones/update-cupon.dto';
import { RedeemCuponDto } from '../dto/cupones/redeem-cupon.dto';
import { CreateCertificadoDto } from '../dto/certificados/create-certificado.dto';
import { RedeemCertificadoDto } from '../dto/certificados/redeem-certificado.dto';

@ApiTags('promotions')
@Controller('promotions')
export class PromotionsController {
  constructor(private readonly promotions: PromotionsService) {}

  // Happy Hours
  @Get('happy-hours')
  listHappyHours() {
    return this.promotions.listHappyHours();
  }

  @Post('happy-hours')
  createHappyHour(@Body() dto: CreateHappyHourDto) {
    return this.promotions.createHappyHour(dto);
  }

  @Patch('happy-hours/:id')
  updateHappyHour(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateHappyHourDto,
  ) {
    return this.promotions.updateHappyHour(id, dto);
  }

  @Delete('happy-hours/:id')
  deleteHappyHour(@Param('id', ParseIntPipe) id: number) {
    return this.promotions.deleteHappyHour(id);
  }

  // Discounts
  @Get('discounts')
  listDiscounts() {
    return this.promotions.listDiscounts();
  }

  @Post('discounts')
  createDiscount(@Body() dto: CreateDiscountDto) {
    return this.promotions.createDiscount(dto);
  }

  @Patch('discounts/:id')
  updateDiscount(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDiscountDto,
  ) {
    return this.promotions.updateDiscount(id, dto);
  }

  @Delete('discounts/:id')
  deleteDiscount(@Param('id', ParseIntPipe) id: number) {
    return this.promotions.deleteDiscount(id);
  }

  // Cupones
  @Get('coupons')
  listCupones() {
    return this.promotions.listCupones();
  }

  @Post('coupons')
  createCupon(@Body() dto: CreateCuponDto) {
    return this.promotions.createCupon(dto);
  }

  @Patch('coupons/:id')
  updateCupon(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCuponDto,
  ) {
    return this.promotions.updateCupon(id, dto);
  }

  @Delete('coupons/:id')
  deleteCupon(@Param('id', ParseIntPipe) id: number) {
    return this.promotions.deleteCupon(id);
  }

  @Post('coupons/redeem')
  redeemCupon(@Body() dto: RedeemCuponDto) {
    return this.promotions.redeemCupon(dto);
  }

  // Certificados
  @Get('certificates')
  listCertificados() {
    return this.promotions.listCertificados();
  }

  @Get('certificates/:serial')
  getCertificadoBySerial(@Param('serial') serial: string) {
    return this.promotions.getCertificadoBySerial(serial);
  }

  @Post('certificates')
  createCertificado(@Body() dto: CreateCertificadoDto) {
    return this.promotions.createCertificado(dto);
  }

  @Post('certificates/:id/deliver')
  markDelivered(@Param('id', ParseIntPipe) id: number) {
    return this.promotions.markCertificadoDelivered(id);
  }

  @Post('certificates/:id/cancel')
  cancel(@Param('id', ParseIntPipe) id: number) {
    return this.promotions.cancelCertificado(id);
  }

  @Delete('certificates/:id')
  deleteCertificado(@Param('id', ParseIntPipe) id: number) {
    return this.promotions.deleteCertificado(id);
  }

  @Post('certificates/redeem')
  redeemCertificado(@Body() dto: RedeemCertificadoDto) {
    return this.promotions.redeemCertificado(dto);
  }
}
