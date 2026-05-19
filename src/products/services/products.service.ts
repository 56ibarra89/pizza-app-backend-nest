import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { IProductsRepository } from '../interfaces/products.repository';
import { PRODUCTS_REPOSITORY } from '../interfaces/products.repository';
import type { CreateCategoryDto } from '../dto/create-category.dto';
import type { UpdateCategoryDto } from '../dto/update-category.dto';
import type { CreateProductDto } from '../dto/create-product.dto';
import type { UpdateProductDto } from '../dto/update-product.dto';
import type { CategoryEntity } from '../entities/category.entity';
import type { ProductEntity } from '../entities/product.entity';
import { validateCreateProduct, validateUpdateProduct } from '../validators/products.validator';

@Injectable()
export class ProductsService {
  constructor(
    @Inject(PRODUCTS_REPOSITORY) private readonly repo: IProductsRepository,
  ) {}

  getCategories(): Promise<CategoryEntity[]> {
    return this.repo.getCategories();
  }

  createCategory(dto: CreateCategoryDto): Promise<CategoryEntity> {
    return this.repo.createCategory(dto);
  }

  updateCategory(id: string, dto: UpdateCategoryDto): Promise<CategoryEntity> {
    return this.repo.updateCategory(id, dto);
  }

  deleteCategory(id: string): Promise<void> {
    return this.repo.deleteCategory(id);
  }

  getProducts(params?: { categoryId?: string }): Promise<ProductEntity[]> {
    return this.repo.getProducts(params);
  }

  async getProductById(id: string): Promise<ProductEntity> {
    const found = await this.repo.getProductById(id);
    if (!found) throw new NotFoundException('Producto no encontrado');
    return found;
  }

  createProduct(dto: CreateProductDto): Promise<ProductEntity> {
    validateCreateProduct(dto);
    return this.repo.createProduct(dto);
  }

  updateProduct(id: string, dto: UpdateProductDto): Promise<ProductEntity> {
    return this.updateProductInternal(id, dto);
  }

  deleteProduct(id: string): Promise<void> {
    return this.repo.deleteProduct(id);
  }

  private async updateProductInternal(
    id: string,
    dto: UpdateProductDto,
  ): Promise<ProductEntity> {
    const current = await this.repo.getProductById(id);
    if (!current) throw new NotFoundException('Producto no encontrado');

    const effectiveHasMultipleSizes =
      dto.hasMultipleSizes ?? current.hasMultipleSizes;
    validateUpdateProduct(dto, effectiveHasMultipleSizes);
    return this.repo.updateProduct(id, dto);
  }
}
