import { PartialType } from '@nestjs/swagger';
import { CreateCorrelativoDto } from './create-correlativo.dto';

export class UpdateCorrelativoDto extends PartialType(CreateCorrelativoDto) {}
