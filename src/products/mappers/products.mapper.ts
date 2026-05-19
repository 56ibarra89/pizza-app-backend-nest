import type { ProductSize } from '../entities/product.entity';
import { ProductSize as DbProductSize } from '@prisma/client';
import { ProductSizeDto } from '../dto/product-size.dto';

export function toDbSize(size: ProductSizeDto | ProductSize): DbProductSize {
  switch (size) {
    case 'familiar':
      return DbProductSize.FAMILIAR;
    case 'mediana':
      return DbProductSize.MEDIANA;
    case 'personal':
      return DbProductSize.PERSONAL;
    case 'único':
      return DbProductSize.UNICO;
    default:
      throw new Error(`Unsupported ProductSize: ${String(size)}`);
  }
}

export function fromDbSize(size: DbProductSize): ProductSize {
  switch (size) {
    case DbProductSize.FAMILIAR:
      return 'familiar';
    case DbProductSize.MEDIANA:
      return 'mediana';
    case DbProductSize.PERSONAL:
      return 'personal';
    case DbProductSize.UNICO:
      return 'único';
    default:
      throw new Error(`Unsupported DbProductSize: ${String(size)}`);
  }
}
