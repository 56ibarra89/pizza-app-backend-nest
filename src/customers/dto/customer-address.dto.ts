import { IsNotEmpty, IsString } from 'class-validator';

export class CustomerAddressDto {
  @IsString()
  @IsNotEmpty()
  address!: string;
}
