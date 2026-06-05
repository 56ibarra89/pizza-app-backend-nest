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
import { CustomersService } from '../services/customers.service';
import { UpsertCustomerDto } from '../dto/upsert-customer.dto';
import { UpdateCustomerDto } from '../dto/update-customer.dto';
import { toCustomerResponseDto } from '../mappers/customers.mapper';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRoleDto } from '../../users/dto/user-role.dto';

@ApiTags('customers')
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  async getCustomers(@Query('query') query?: string) {
    const list = query ? await this.customers.search(query) : await this.customers.getAll();
    return list.map(toCustomerResponseDto);
  }

  @Get(':id')
  async getCustomerById(@Param('id', new ParseUUIDPipe()) id: string) {
    const customer = await this.customers.getById(id);
    return toCustomerResponseDto(customer);
  }

  @Post('upsert')
  @Roles(UserRoleDto.admin, UserRoleDto.cajero)
  async upsertCustomer(@Body() dto: UpsertCustomerDto) {
    const result = await this.customers.upsert(dto);
    return {
      customer: toCustomerResponseDto(result.customer),
      isNew: result.isNew,
    };
  }

  @Patch(':id')
  @Roles(UserRoleDto.admin, UserRoleDto.cajero)
  async updateCustomer(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    const updated = await this.customers.updateById(id, dto);
    return toCustomerResponseDto(updated);
  }

  @Delete(':id')
  @Roles(UserRoleDto.admin, UserRoleDto.cajero)
  deleteCustomer(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.customers.deleteById(id);
  }
}
