import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

export class UpdateFloorDto {
  @IsInt()
  @IsNotEmpty()
  id!: number;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsInt()
  @Min(0)
  tableCount!: number;
}
