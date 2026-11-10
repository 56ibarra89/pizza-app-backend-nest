import { IsUUID } from 'class-validator';

export class UpdateOrderWaiterDto {
  @IsUUID()
  waiterId!: string;
}
