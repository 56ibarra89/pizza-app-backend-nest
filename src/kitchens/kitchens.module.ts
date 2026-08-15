import { Module } from '@nestjs/common';
import { KitchensService } from './kitchens.service';
import { KitchensController } from './kitchens.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [KitchensController],
  providers: [KitchensService],
  exports: [KitchensService],
})
export class KitchensModule {}
