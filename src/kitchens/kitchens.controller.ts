import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { KitchensService } from './kitchens.service';
import { CreateKitchenDto } from './dto/create-kitchen.dto';
import { UpdateKitchenDto } from './dto/update-kitchen.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { Permissions, UserRoleDto } from '../common';
import type { WeekDay } from '@prisma/client';

@Controller('kitchens')
export class KitchensController {
  constructor(private readonly kitchensService: KitchensService) {}

  @Post()
  @Permissions('kitchen.configure')
  @Roles(UserRoleDto.admin)
  create(@Body() createKitchenDto: CreateKitchenDto) {
    return this.kitchensService.create(createKitchenDto);
  }

  @Get('cooks/assignments')
  @Permissions('kitchen.configure')
  @Roles(UserRoleDto.admin)
  getCooksWithAssignments() {
    return this.kitchensService.getCooksWithAssignments();
  }

  @Patch('cooks/:userId/assignments')
  @Permissions('kitchen.configure')
  @Roles(UserRoleDto.admin)
  updateCookAssignments(
    @Param('userId') userId: string,
    @Body('assignments')
    assignments: {
      dayOfWeek: WeekDay;
      kitchenId: string | null;
    }[],
  ) {
    return this.kitchensService.updateCookAssignments(userId, assignments);
  }

  @Get('me/assignments')
  @Permissions('kitchen.read')
  @Roles(UserRoleDto.cocinero)
  getMyAssignments(@CurrentUser() user: AuthenticatedUser) {
    return this.kitchensService.getUserAssignments(user.id);
  }

  @Get()
  @Permissions('kitchen.read')
  findAll() {
    return this.kitchensService.findAll();
  }

  @Get(':id')
  @Permissions('kitchen.read')
  findOne(@Param('id') id: string) {
    return this.kitchensService.findOne(id);
  }

  @Patch(':id')
  @Permissions('kitchen.configure')
  @Roles(UserRoleDto.admin)
  update(@Param('id') id: string, @Body() updateKitchenDto: UpdateKitchenDto) {
    return this.kitchensService.update(id, updateKitchenDto);
  }

  @Delete(':id')
  @Permissions('kitchen.configure')
  @Roles(UserRoleDto.admin)
  remove(@Param('id') id: string) {
    return this.kitchensService.remove(id);
  }
}
