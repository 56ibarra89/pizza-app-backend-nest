import { Module } from '@nestjs/common';
import { PromotionsController } from './controllers/promotions.controller';
import { PromotionsService } from './services/promotions.service';
import { PROMOTIONS_REPOSITORY } from './interfaces/promotions.repository';
import { PrismaPromotionsRepository } from './repositories/prisma-promotions.repository';

@Module({
  controllers: [PromotionsController],
  providers: [
    PromotionsService,
    {
      provide: PROMOTIONS_REPOSITORY,
      useClass: PrismaPromotionsRepository,
    },
  ],
})
export class PromotionsModule {}
