import { Inject, Injectable } from '@nestjs/common';
import {
  SYSTEM_LOGS_REPOSITORY,
  type ISystemLogsRepository,
} from '../interfaces/system-logs.repository';
import type { CreateSystemLogDto } from '../dto/create-system-log.dto';
import type { GetSystemLogsQueryDto } from '../dto/get-system-logs-query.dto';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';

@Injectable()
export class SystemLogsService {
  constructor(
    @Inject(SYSTEM_LOGS_REPOSITORY)
    private readonly repo: ISystemLogsRepository,
  ) {}

  create(dto: CreateSystemLogDto, user: AuthenticatedUser) {
    return this.repo.create({
      userId: user.id,
      user: user.username,
      role: user.role,
      action: dto.action,
      details: dto.details,
      level: dto.level,
    });
  }

  getMany(query: GetSystemLogsQueryDto) {
    const limit = query.limit ?? 200;
    return this.repo.findMany({
      limit,
      user: query.user,
      action: query.action,
      level: query.level,
    });
  }
}
