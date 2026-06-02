import { IsEnum, IsNotEmpty } from 'class-validator';
import { MesaEstado } from '@prisma/client';

export class UpdateMesaStatusDto {
  @IsEnum(MesaEstado)
  @IsNotEmpty()
  estado!: MesaEstado;
}
