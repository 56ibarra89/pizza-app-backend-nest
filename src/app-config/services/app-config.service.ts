import { Inject, Injectable } from '@nestjs/common';
import {
  APP_CONFIG_REPOSITORY,
  type IAppConfigRepository,
} from '../interfaces/app-config.repository';
import type { UpdateAppConfigDto } from '../dto/update-app-config.dto';

@Injectable()
export class AppConfigService {
  constructor(
    @Inject(APP_CONFIG_REPOSITORY) private readonly repo: IAppConfigRepository,
  ) {}

  async getByIdOrDefault(id: string) {
    const found = await this.repo.findById(id);
    if (found) return found;
    return { id, data: {}, updatedAt: new Date(0) };
  }

  upsert(id: string, dto: UpdateAppConfigDto) {
    return this.repo.upsert({
      id,
      data: dto.data,
      createdById: dto.createdById,
      updatedById: dto.updatedById,
    });
  }
}
