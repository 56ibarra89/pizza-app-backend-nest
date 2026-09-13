import { IsString, IsNotEmpty, Matches } from 'class-validator';

export class AuthResetPasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'El token es obligatorio' })
  @Matches(/^[A-Za-z0-9._-]{16,4096}$/, { message: 'El token no es válido' })
  token: string;

  @IsString()
  @IsNotEmpty({ message: 'La nueva contraseña es obligatoria' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,128}$/, {
    message: 'La contraseña debe tener de 8 a 128 caracteres, una mayúscula, una minúscula, un número y un carácter especial (@$!%*?&)'
  })
  newPassword: string;
}
