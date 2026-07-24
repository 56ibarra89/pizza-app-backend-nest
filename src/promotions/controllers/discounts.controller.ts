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
import { CreateDiscountDto } from '../dto/discounts/create-discount.dto';
import { UpdateDiscountDto } from '../dto/discounts/update-discount.dto';
import { CommercialPromotionsService } from '../services/commercial-promotions.service';

@ApiTags('promotions')
@Controller('promotions/discounts')
export class DiscountsController {
  constructor(
    private readonly commercialPromotions: CommercialPromotionsService,
  ) {}

  @Get()
  list() {
    return this.commercialPromotions.listDiscounts();
  }

  @Post()
  @Roles(UserRoleDto.admin)
  create(@Body() dto: CreateDiscountDto) {
    return this.commercialPromotions.createDiscount(dto);
  }

  @Patch(':id')
  @Roles(UserRoleDto.admin)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDiscountDto,
  ) {
    return this.commercialPromotions.updateDiscount(id, dto);
  }

  @Delete(':id')
  @Roles(UserRoleDto.admin)
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.commercialPromotions.deleteDiscount(id);
  }
}
