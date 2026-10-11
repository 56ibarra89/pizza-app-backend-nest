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
import { Permissions, UserRoleDto } from '../../common';
import { CreateCuponDto } from '../dto/cupones/create-cupon.dto';
import { RedeemCuponDto } from '../dto/cupones/redeem-cupon.dto';
import { UpdateCuponDto } from '../dto/cupones/update-cupon.dto';
import { CouponPromotionsService } from '../services/coupon-promotions.service';

@ApiTags('promotions')
@Controller('promotions/coupons')
@Permissions('promotions.read')
export class CouponsController {
  constructor(private readonly coupons: CouponPromotionsService) {}

  @Get()
  list() {
    return this.coupons.list();
  }

  @Post()
  @Permissions('promotions.manage')
  @Roles(UserRoleDto.admin)
  create(@Body() dto: CreateCuponDto) {
    return this.coupons.create(dto);
  }

  @Patch(':id')
  @Permissions('promotions.manage')
  @Roles(UserRoleDto.admin)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCuponDto) {
    return this.coupons.update(id, dto);
  }

  @Delete(':id')
  @Permissions('promotions.manage')
  @Roles(UserRoleDto.admin)
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.coupons.delete(id);
  }

  @Post('redeem')
  @Permissions('billing.create')
  @Roles(
    UserRoleDto.admin,
    UserRoleDto.cajero,
    UserRoleDto.cajero_principal,
    UserRoleDto.despachador,
  )
  redeem(@Body() dto: RedeemCuponDto) {
    return this.coupons.redeem(dto);
  }
}
