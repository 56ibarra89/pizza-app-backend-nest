import { ArrayMaxSize, IsArray, IsNotEmpty, IsString } from 'class-validator';

export class HideOrdersDto {
  @IsArray()
  @ArrayMaxSize(250)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  orderIds!: string[];
}
