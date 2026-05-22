import type { AppConfigEntity } from '../entities/app-config.entity';

export const APP_CONFIG_REPOSITORY = Symbol('APP_CONFIG_REPOSITORY');

export interface IAppConfigRepository {
  findById(id: string): Promise<AppConfigEntity | null>;
  upsert(params: {
    id: string;
    data: unknown;
    createdById?: string;
    updatedById?: string;
  }): Promise<AppConfigEntity>;
}
