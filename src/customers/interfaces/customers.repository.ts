import type { CustomerEntity } from '../entities/customer.entity';

export const CUSTOMERS_REPOSITORY = Symbol('CUSTOMERS_REPOSITORY');

export interface ICustomersRepository {
  getAll(): Promise<CustomerEntity[]>;
  search(query: string): Promise<CustomerEntity[]>;
  findById(id: string): Promise<CustomerEntity | null>;
  findByNameLower(nameLower: string): Promise<CustomerEntity | null>;
  upsertByName(params: {
    name: string;
    phone?: string;
    address?: string;
  }): Promise<{ customer: CustomerEntity; isNew: boolean }>;
  updateById(id: string, dto: { name?: string; phone?: string }): Promise<CustomerEntity>;
  deleteById(id: string): Promise<void>;
}
