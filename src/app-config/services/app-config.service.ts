import { Inject, Injectable } from '@nestjs/common';
import {
  APP_CONFIG_REPOSITORY,
  type IAppConfigRepository,
} from '../interfaces/app-config.repository';
import type { UpdateAppConfigDto } from '../dto/update-app-config.dto';
import {
  DELIVERY_PRICES_ID,
  DELIVERY_RULES_ID,
  readActiveDeliveryZones,
  readConfiguredDeliveryZones,
  usesDeliveryZonePricing,
} from '../delivery-rules.config';

@Injectable()
export class AppConfigService {
  constructor(
    @Inject(APP_CONFIG_REPOSITORY) private readonly repo: IAppConfigRepository,
  ) {}

  async getByIdOrDefault(id: string) {
    if (id === DELIVERY_PRICES_ID) {
      const rules = await this.repo.findById(DELIVERY_RULES_ID);
      const zones = readConfiguredDeliveryZones(rules?.data);
      if (rules && usesDeliveryZonePricing(rules.data)) {
        const prices = readActiveDeliveryZones(zones).map(({ price }) =>
          String(price),
        );
        return {
          id,
          data: { prices: [...new Set(prices)] },
          updatedAt: rules.updatedAt,
        };
      }
    }
    const found = await this.repo.findById(id);
    if (found) return found;
    return { id, data: {}, updatedAt: new Date(0) };
  }

  upsert(id: string, dto: UpdateAppConfigDto, actorId?: string) {
    return this.repo.upsert({
      id,
      data: dto.data,
      createdById: actorId ?? dto.createdById,
      updatedById: actorId ?? dto.updatedById,
    });
  }
}
