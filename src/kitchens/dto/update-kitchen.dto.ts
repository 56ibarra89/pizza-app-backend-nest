import { PartialType } from '@nestjs/mapped-types';
import { CreateKitchenDto } from './create-kitchen.dto';

export class UpdateKitchenDto extends PartialType(CreateKitchenDto) {}
