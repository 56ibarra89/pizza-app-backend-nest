import { ArrayMaxSize, IsArray, IsNotEmpty, IsString } from 'class-validator';

export class HideKitchenTicketsDto {
  @IsArray()
  @ArrayMaxSize(250)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  ticketIds!: string[];
}
