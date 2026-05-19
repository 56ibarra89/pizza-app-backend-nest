export interface CustomerAddressResponseDto {
  id: string;
  address: string;
  lastUsed: string;
}

export interface CustomerResponseDto {
  id: string;
  nameLower: string;
  name: string;
  phone?: string;
  addresses: CustomerAddressResponseDto[];
  createdAt: string;
  updatedAt: string;
}

export interface UpsertCustomerResponseDto {
  customer: CustomerResponseDto;
  isNew: boolean;
}
