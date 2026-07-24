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
import { CreateHappyHourDto } from '../dto/happy-hours/create-happy-hour.dto';
import { UpdateHappyHourDto } from '../dto/happy-hours/update-happy-hour.dto';
import { CommercialPromotionsService } from '../services/commercial-promotions.service';

@ApiTags('promotions')
@Controller('promotions/happy-hours')
export class HappyHoursController {
  constructor(
    private readonly commercialPromotions: CommercialPromotionsService,
  ) {}

  @Get()
  list() {
    return this.commercialPromotions.listHappyHours();
  }

  @Post()
  @Roles(UserRoleDto.admin)
  create(@Body() dto: CreateHappyHourDto) {
    return this.commercialPromotions.createHappyHour(dto);
  }

  @Patch(':id')
  @Roles(UserRoleDto.admin)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateHappyHourDto,
  ) {
    return this.commercialPromotions.updateHappyHour(id, dto);
  }

  @Delete(':id')
  @Roles(UserRoleDto.admin)
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.commercialPromotions.deleteHappyHour(id);
  }
}
