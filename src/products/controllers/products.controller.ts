import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ProductsService } from '../services/products.service';
import { CreateCategoryDto } from '../dto/create-category.dto';
import { UpdateCategoryDto } from '../dto/update-category.dto';
import { CreateProductDto } from '../dto/create-product.dto';
import { UpdateProductDto } from '../dto/update-product.dto';

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get('categories')
  getCategories() {
    return this.products.getCategories();
  }

  @Post('categories')
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.products.createCategory(dto);
  }

  @Patch('categories/:id')
  updateCategory(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.products.updateCategory(id, dto);
  }

  @Delete('categories/:id')
  deleteCategory(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.products.deleteCategory(id);
  }

  @Get()
  getProducts(@Query('categoryId') categoryId?: string) {
    return this.products.getProducts({ categoryId });
  }

  @Get(':id')
  getProductById(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.products.getProductById(id);
  }

  @Post()
  createProduct(@Body() dto: CreateProductDto) {
    return this.products.createProduct(dto);
  }

  @Patch(':id')
  updateProduct(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.products.updateProduct(id, dto);
  }

  @Delete(':id')
  deleteProduct(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.products.deleteProduct(id);
  }
}
