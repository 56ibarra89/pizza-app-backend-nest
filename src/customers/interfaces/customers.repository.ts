import type { CustomerEntity } from '../entities/customer.entity';
import type { UpdateCustomerDto } from '../dto/update-customer.dto';

export const CUSTOMERS_REPOSITORY = Symbol('CUSTOMERS_REPOSITORY');

export interface ICustomersRepository {
  getAll(): Promise<CustomerEntity[]>;
  search(query: string): Promise<CustomerEntity[]>;
  findById(id: string): Promise<CustomerEntity | null>;
  findByNameLower(nameLower: string): Promise<CustomerEntity | null>;
  create(params: {
    name: string;
    phone?: string;
    address?: string;
  }): Promise<CustomerEntity>;
  upsertByName(params: {
    name: string;
    phone?: string;
    address?: string;
  }): Promise<{ customer: CustomerEntity; isNew: boolean }>;
  updateById(
    id: string,
    dto: UpdateCustomerDto,
  ): Promise<CustomerEntity>;
  deleteById(id: string): Promise<void>;
}
