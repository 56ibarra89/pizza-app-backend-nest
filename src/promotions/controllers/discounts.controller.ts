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
import { CreateDiscountDto } from '../dto/discounts/create-discount.dto';
import { UpdateDiscountDto } from '../dto/discounts/update-discount.dto';
import { CommercialPromotionsService } from '../services/commercial-promotions.service';

@ApiTags('promotions')
@Controller('promotions/discounts')
@Permissions('promotions.read')
export class DiscountsController {
  constructor(
    private readonly commercialPromotions: CommercialPromotionsService,
  ) {}

  @Get()
  list() {
    return this.commercialPromotions.listDiscounts();
  }

  @Post()
  @Permissions('promotions.manage')
  @Roles(UserRoleDto.admin)
  create(@Body() dto: CreateDiscountDto) {
    return this.commercialPromotions.createDiscount(dto);
  }

  @Patch(':id')
  @Permissions('promotions.manage')
  @Roles(UserRoleDto.admin)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDiscountDto,
  ) {
    return this.commercialPromotions.updateDiscount(id, dto);
  }

  @Delete(':id')
  @Permissions('promotions.manage')
  @Roles(UserRoleDto.admin)
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.commercialPromotions.deleteDiscount(id);
  }
}
