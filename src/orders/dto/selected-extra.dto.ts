import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class SelectedExtraDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsNumber()
  price!: number;
}
