export interface CustomerAddressEntity {
  id: string;
  address: string;
  isDefault: boolean;
  lastUsed: Date;
}

export interface CustomerPhoneEntity {
  id: string;
  phone: string;
  isDefault: boolean;
  lastUsed: Date;
}

export interface CustomerEntity {
  id: string;
  name: string;
  phone?: string;
  phones: CustomerPhoneEntity[];
  addresses: CustomerAddressEntity[];
  createdAt: Date;
  updatedAt: Date;
}
