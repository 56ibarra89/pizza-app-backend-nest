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
import { ApiTags } from '@nestjs/swagger';
import { ProductsService } from '../services/products.service';
import { CreateCategoryDto } from '../dto/create-category.dto';
import { UpdateCategoryDto } from '../dto/update-category.dto';
import { CreateProductDto } from '../dto/create-product.dto';
import { UpdateProductDto } from '../dto/update-product.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRoleDto } from '../../users/dto/user-role.dto';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get('categories')
  getCategories() {
    return this.products.getCategories();
  }

  @Post('categories')
  @Roles(UserRoleDto.admin)
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.products.createCategory(dto);
  }

  @Patch('categories/:id')
  @Roles(UserRoleDto.admin)
  updateCategory(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.products.updateCategory(id, dto);
  }

  @Delete('categories/:id')
  @Roles(UserRoleDto.admin)
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
  @Roles(UserRoleDto.admin)
  createProduct(@Body() dto: CreateProductDto) {
    return this.products.createProduct(dto);
  }

  @Patch(':id')
  @Roles(UserRoleDto.admin)
  updateProduct(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.products.updateProduct(id, dto);
  }

  @Delete(':id')
  @Roles(UserRoleDto.admin)
  deleteProduct(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.products.deleteProduct(id);
  }
}
