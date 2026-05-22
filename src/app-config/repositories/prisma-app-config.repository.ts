import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { IAppConfigRepository } from '../interfaces/app-config.repository';
import type { AppConfigEntity } from '../entities/app-config.entity';

@Injectable()
export class PrismaAppConfigRepository implements IAppConfigRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<AppConfigEntity | null> {
    const found = await this.prisma.appConfig.findUnique({ where: { id } });
    return found ? this.map(found) : null;
  }

  async upsert(params: {
    id: string;
    data: unknown;
    createdById?: string;
    updatedById?: string;
  }): Promise<AppConfigEntity> {
    const saved = await this.prisma.appConfig.upsert({
      where: { id: params.id },
      create: {
        id: params.id,
        data: params.data as any,
        createdById: params.createdById,
        updatedById: params.updatedById ?? params.createdById,
      },
      update: {
        data: params.data as any,
        updatedById: params.updatedById,
      },
    });

    return this.map(saved);
  }

  private map(row: {
    id: string;
    data: unknown;
    createdById: string | null;
    updatedById: string | null;
    updatedAt: Date;
  }): AppConfigEntity {
    return {
      id: row.id,
      data: row.data,
      createdById: row.createdById ?? undefined,
      updatedById: row.updatedById ?? undefined,
      updatedAt: row.updatedAt,
    };
  }
}
