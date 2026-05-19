import { Module } from '@nestjs/common';
import { ProductsController } from './controllers/products.controller';
import { ProductsService } from './services/products.service';
import { PRODUCTS_REPOSITORY } from './interfaces/products.repository';
import { PrismaProductsRepository } from './repositories/prisma-products.repository';

@Module({
  controllers: [ProductsController],
  providers: [
    ProductsService,
    {
      provide: PRODUCTS_REPOSITORY,
      useClass: PrismaProductsRepository,
    },
  ],
})
export class ProductsModule {}
