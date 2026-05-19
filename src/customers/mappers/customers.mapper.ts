import type { CustomerEntity } from '../entities/customer.entity';
import type {
  CustomerResponseDto,
  CustomerAddressResponseDto,
} from '../dto/customer-response.dto';

export function toCustomerResponseDto(entity: CustomerEntity): CustomerResponseDto {
  const addresses: CustomerAddressResponseDto[] = [...entity.addresses]
    .sort((a, b) => b.lastUsed.getTime() - a.lastUsed.getTime())
    .map((a) => ({
      id: a.id,
      address: a.address,
      lastUsed: a.lastUsed.toISOString(),
    }));

  return {
    id: entity.id,
    nameLower: entity.nameLower,
    name: entity.name,
    phone: entity.phone,
    addresses,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}
