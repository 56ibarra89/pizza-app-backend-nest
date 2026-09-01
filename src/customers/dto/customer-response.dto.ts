export interface CustomerAddressResponseDto {
  id: string;
  address: string;
  isDefault: boolean;
  lastUsed: string;
}

export interface CustomerPhoneResponseDto {
  id: string;
  phone: string;
  isDefault: boolean;
  lastUsed: string;
}

export interface CustomerResponseDto {
  id: string;
  name: string;
  phone?: string;
  phones: CustomerPhoneResponseDto[];
  addresses: CustomerAddressResponseDto[];
  createdAt: string;
  updatedAt: string;
}

export interface UpsertCustomerResponseDto {
  customer: CustomerResponseDto;
  isNew: boolean;
}
