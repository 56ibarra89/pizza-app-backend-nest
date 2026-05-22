import { Module } from '@nestjs/common';
import { CorrelativosController } from './controllers/correlativos.controller';
import { CorrelativosService } from './services/correlativos.service';
import { CORRELATIVOS_REPOSITORY } from './interfaces/correlativos.repository';
import { PrismaCorrelativosRepository } from './repositories/prisma-correlativos.repository';

@Module({
  controllers: [CorrelativosController],
  providers: [
    CorrelativosService,
    {
      provide: CORRELATIVOS_REPOSITORY,
      useClass: PrismaCorrelativosRepository,
    },
  ],
})
export class CorrelativosModule {}
