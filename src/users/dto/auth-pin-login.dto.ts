import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class AuthPinLoginDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{6}$/, { message: 'El PIN debe contener exactamente 6 dígitos.' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  pin!: string;
}
