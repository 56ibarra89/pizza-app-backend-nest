export interface CustomerAddressEntity {
  id: string;
  address: string;
  lastUsed: Date;
}

export interface CustomerEntity {
  id: string;
  name: string;
  phone?: string;
  addresses: CustomerAddressEntity[];
  createdAt: Date;
  updatedAt: Date;
}
