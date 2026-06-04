import { IsEmail, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AuthForgotPasswordDto {
  @ApiProperty({
    description: 'El correo electrónico del administrador',
    example: 'admin@pizzatogo.com',
  })
  @IsEmail({}, { message: 'El formato de correo no es válido' })
  @IsNotEmpty({ message: 'El correo es obligatorio' })
  email: string;
}
