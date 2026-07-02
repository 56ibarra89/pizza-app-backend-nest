import { IsString, IsNotEmpty, IsBoolean, IsOptional } from 'class-validator';

export class CreateKitchenDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
