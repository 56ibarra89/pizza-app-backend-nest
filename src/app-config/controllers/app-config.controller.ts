import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { AppConfigService } from '../services/app-config.service';
import { UpdateAppConfigDto } from '../dto/update-app-config.dto';

@Controller('config')
export class AppConfigController {
  constructor(private readonly service: AppConfigService) {}

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.service.getByIdOrDefault(id);
  }

  @Put(':id')
  upsert(@Param('id') id: string, @Body() dto: UpdateAppConfigDto) {
    return this.service.upsert(id, dto);
  }
}
