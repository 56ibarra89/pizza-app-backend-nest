import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CorrelativoStatus, type DocumentType } from '@prisma/client';
import {
  CORRELATIVOS_REPOSITORY,
  type ICorrelativosRepository,
} from '../interfaces/correlativos.repository';
import type { CreateCorrelativoDto } from '../dto/create-correlativo.dto';
import type { UpdateCorrelativoDto } from '../dto/update-correlativo.dto';
import { parseBusinessDateInput } from '../../common/time/business-time.util';

@Injectable()
export class CorrelativosService {
  constructor(
    @Inject(CORRELATIVOS_REPOSITORY)
    private readonly repo: ICorrelativosRepository,
  ) {}

  getAll() {
    return this.repo.getAll();
  }

  async getActive(documentType: DocumentType) {
    const found = await this.repo.findActiveByDocumentType(documentType);
    if (!found) throw new NotFoundException('No hay correlativo activo');
    return found;
  }

  async create(dto: CreateCorrelativoDto) {
    const prefix = dto.prefix?.trim() ?? '';
    const startNumber = dto.startNumber;
    const endNumber = dto.endNumber;
    const currentNumber = dto.currentNumber ?? startNumber;

    if (endNumber < startNumber) {
      throw new BadRequestException(
        'endNumber no puede ser menor que startNumber',
      );
    }
    if (currentNumber < startNumber || currentNumber > endNumber + 1) {
      throw new BadRequestException('currentNumber fuera de rango');
    }

    if (dto.status === CorrelativoStatus.ACTIVO) {
      // El repositorio desactiva correlativos previos dentro de la misma transacción.
    }

    return this.repo.create({
      documentType: dto.documentType,
      resolutionNumber: dto.resolutionNumber.trim(),
      prefix,
      startNumber,
      endNumber,
      currentNumber,
      issueDate: parseBusinessDateInput(dto.issueDate, 'start'),
      expirationDate: parseBusinessDateInput(dto.expirationDate, 'end'),
      status: dto.status,
    });
  }

  async update(id: string, dto: UpdateCorrelativoDto) {
    if (
      dto.endNumber !== undefined &&
      dto.startNumber !== undefined &&
      dto.endNumber < dto.startNumber
    ) {
      throw new BadRequestException(
        'endNumber no puede ser menor que startNumber',
      );
    }
    if (
      dto.currentNumber !== undefined &&
      dto.startNumber !== undefined &&
      dto.currentNumber < dto.startNumber
    ) {
      throw new BadRequestException('currentNumber fuera de rango');
    }
    if (
      dto.currentNumber !== undefined &&
      dto.endNumber !== undefined &&
      dto.currentNumber > dto.endNumber + 1
    ) {
      throw new BadRequestException('currentNumber fuera de rango');
    }
    if (dto.status === CorrelativoStatus.ACTIVO && dto.documentType) {
      // El repositorio desactiva correlativos previos dentro de la misma transacción.
    }

    return this.repo.update(id, {
      documentType: dto.documentType,
      resolutionNumber: dto.resolutionNumber?.trim(),
      prefix: dto.prefix?.trim(),
      startNumber: dto.startNumber,
      endNumber: dto.endNumber,
      currentNumber: dto.currentNumber,
      issueDate: dto.issueDate
        ? parseBusinessDateInput(dto.issueDate, 'start')
        : undefined,
      expirationDate: dto.expirationDate
        ? parseBusinessDateInput(dto.expirationDate, 'end')
        : undefined,
      status: dto.status,
    });
  }

  consumeNext(documentType: DocumentType) {
    return this.repo.consumeNext(documentType);
  }

  deleteById(id: string) {
    return this.repo.deleteById(id);
  }
}
