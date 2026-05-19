import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString } from 'class-validator';

export class AuthLoginDto {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  identifier!: string; // username o email

  @IsString()
  @IsNotEmpty()
  password!: string;
}
