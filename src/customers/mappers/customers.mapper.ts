import type { CustomerEntity } from '../entities/customer.entity';
import type {
  CustomerResponseDto,
  CustomerAddressResponseDto,
  CustomerPhoneResponseDto,
} from '../dto/customer-response.dto';

export function toCustomerResponseDto(entity: CustomerEntity): CustomerResponseDto {
  const addresses: CustomerAddressResponseDto[] = [...(entity.addresses || [])]
    .sort((a, b) => {
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      return b.lastUsed.getTime() - a.lastUsed.getTime();
    })
    .map((a) => ({
      id: a.id,
      address: a.address,
      isDefault: Boolean(a.isDefault),
      lastUsed: a.lastUsed.toISOString(),
    }));

  const phones: CustomerPhoneResponseDto[] = [...(entity.phones || [])]
    .sort((a, b) => {
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      return b.lastUsed.getTime() - a.lastUsed.getTime();
    })
    .map((p) => ({
      id: p.id,
      phone: p.phone,
      isDefault: Boolean(p.isDefault),
      lastUsed: p.lastUsed.toISOString(),
    }));

  return {
    id: entity.id,
    name: entity.name,
    phone: entity.phone,
    phones,
    addresses,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}
