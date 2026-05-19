import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CUSTOMERS_REPOSITORY, type ICustomersRepository } from '../interfaces/customers.repository';
import type { UpsertCustomerDto } from '../dto/upsert-customer.dto';
import type { UpdateCustomerDto } from '../dto/update-customer.dto';

@Injectable()
export class CustomersService {
  constructor(
    @Inject(CUSTOMERS_REPOSITORY) private readonly repo: ICustomersRepository,
  ) {}

  getAll() {
    return this.repo.getAll();
  }

  search(query: string) {
    return this.repo.search(query);
  }

  async getById(id: string) {
    const found = await this.repo.findById(id);
    if (!found) throw new NotFoundException('Cliente no encontrado');
    return found;
  }

  upsert(dto: UpsertCustomerDto) {
    return this.repo.upsertByName({
      name: dto.name,
      phone: dto.phone,
      address: dto.address,
    });
  }

  updateById(id: string, dto: UpdateCustomerDto) {
    return this.repo.updateById(id, dto);
  }

  deleteById(id: string) {
    return this.repo.deleteById(id);
  }
}
