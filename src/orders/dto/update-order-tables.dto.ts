import { IsArray, IsNotEmpty, IsString } from 'class-validator';

export class UpdateOrderTablesDto {
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  tableIds!: string[];
}
