import type { CategoryEntity } from '../entities/category.entity';
import type { ProductEntity } from '../entities/product.entity';
import type { CreateCategoryDto } from '../dto/create-category.dto';
import type { UpdateCategoryDto } from '../dto/update-category.dto';
import type { CreateProductDto } from '../dto/create-product.dto';
import type { UpdateProductDto } from '../dto/update-product.dto';
import type {
  CreateCategoryExtraDto,
  UpdateCategoryExtraDto,
} from '../dto/category-extra.dto';
import type { ExtraIngredientEntity } from '../entities/product.entity';

export const PRODUCTS_REPOSITORY = Symbol('PRODUCTS_REPOSITORY');

export interface IProductsRepository {
  getCategories(): Promise<CategoryEntity[]>;
  createCategory(dto: CreateCategoryDto): Promise<CategoryEntity>;
  updateCategory(id: string, dto: UpdateCategoryDto): Promise<CategoryEntity>;
  deleteCategory(id: string): Promise<void>;
  createCategoryExtra(
    categoryId: string,
    dto: CreateCategoryExtraDto,
  ): Promise<ExtraIngredientEntity>;
  updateCategoryExtra(
    categoryId: string,
    extraId: string,
    dto: UpdateCategoryExtraDto,
  ): Promise<ExtraIngredientEntity>;
  deleteCategoryExtra(categoryId: string, extraId: string): Promise<void>;

  getProducts(params?: { categoryId?: string }): Promise<ProductEntity[]>;
  getProductById(id: string): Promise<ProductEntity | null>;
  createProduct(dto: CreateProductDto): Promise<ProductEntity>;
  updateProduct(id: string, dto: UpdateProductDto): Promise<ProductEntity>;
  deleteProduct(id: string): Promise<void>;
}
