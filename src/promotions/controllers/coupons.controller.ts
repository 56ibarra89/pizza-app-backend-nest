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
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRoleDto } from '../../users/dto/user-role.dto';
import { CreateCuponDto } from '../dto/cupones/create-cupon.dto';
import { RedeemCuponDto } from '../dto/cupones/redeem-cupon.dto';
import { UpdateCuponDto } from '../dto/cupones/update-cupon.dto';
import { CouponPromotionsService } from '../services/coupon-promotions.service';

@ApiTags('promotions')
@Controller('promotions/coupons')
export class CouponsController {
  constructor(private readonly coupons: CouponPromotionsService) {}

  @Get()
  list() {
    return this.coupons.list();
  }

  @Post()
  @Roles(UserRoleDto.admin)
  create(@Body() dto: CreateCuponDto) {
    return this.coupons.create(dto);
  }

  @Patch(':id')
  @Roles(UserRoleDto.admin)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCuponDto) {
    return this.coupons.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRoleDto.admin)
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.coupons.delete(id);
  }

  @Post('redeem')
  @Roles(UserRoleDto.admin, UserRoleDto.cajero)
  redeem(@Body() dto: RedeemCuponDto) {
    return this.coupons.redeem(dto);
  }
}
