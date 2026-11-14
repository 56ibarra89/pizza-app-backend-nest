import { BadRequestException } from '@nestjs/common';
import type { CreateProductDto } from '../dto/create-product.dto';
import type { UpdateProductDto } from '../dto/update-product.dto';
import type { ProductEntity } from '../entities/product.entity';

function ensureUniqueSizes(prices: { size: string }[], context: string): void {
  const sizes = prices.map((p) => {
    const normalized = p.size.trim().toLowerCase();
    if (!normalized) {
      throw new BadRequestException(
        `${context}: el tamaño no puede estar vacío`,
      );
    }
    return normalized;
  });
  const unique = new Set(sizes);
  if (unique.size !== sizes.length) {
    throw new BadRequestException(`${context}: tamaños duplicados en precios`);
  }
}

function validatePricesForMode(
  hasMultipleSizes: boolean,
  prices: { size: string; price: number }[],
  context: string,
): void {
  ensureUniqueSizes(prices, context);

  const hasUnico = prices.some((p) => {
    const normalized = p.size.trim().toLowerCase();
    return normalized === 'unico' || normalized === 'único';
  });

  if (hasMultipleSizes) {
    if (hasUnico) {
      throw new BadRequestException(
        `${context}: no se permite tamaño único cuando hay múltiples tamaños`,
      );
    }
  } else {
    if (prices.length !== 1 || !hasUnico) {
      throw new BadRequestException(
        `${context}: cuando no hay múltiples tamaños, debe existir exactamente un precio con tamaño único`,
      );
    }
  }

  for (const p of prices) {
    if (!Number.isFinite(p.price) || p.price < 0) {
      throw new BadRequestException(
        `${context}: el precio no puede ser negativo`,
      );
    }
  }
}

export function validateCreateProduct(dto: CreateProductDto): void {
  const trimmedName = dto.name?.trim() ?? '';
  if (!trimmedName) {
    throw new BadRequestException('Producto: el nombre no puede estar vacío');
  }
  dto.name = trimmedName;

  if (
    dto.comboPrice !== undefined &&
    (!Number.isFinite(dto.comboPrice) || dto.comboPrice < 0)
  ) {
    throw new BadRequestException(
      'Producto: el precio del combo no puede ser negativo',
    );
  }

  if (dto.isCombo) {
    dto.hasMultipleSizes = false;
    if (
      (!dto.prices || dto.prices.length === 0) &&
      dto.comboPrice !== undefined
    ) {
      dto.prices = [{ size: 'único', price: dto.comboPrice }];
    }
  }

  if (!dto.prices || dto.prices.length === 0) {
    throw new BadRequestException(
      'Producto: debes proporcionar al menos un precio',
    );
  }

  const hasMultipleSizes = dto.hasMultipleSizes ?? false;
  validatePricesForMode(hasMultipleSizes, dto.prices, 'Producto');
}

export function validateUpdateProduct(
  dto: UpdateProductDto,
  hasMultipleSizes: boolean,
  current?: Pick<ProductEntity, 'isCombo' | 'hasMultipleSizes' | 'prices'>,
): void {
  if (dto.name !== undefined) {
    const trimmedName = dto.name.trim();
    if (!trimmedName) {
      throw new BadRequestException('Producto: el nombre no puede estar vacío');
    }
    dto.name = trimmedName;
  }

  if (
    dto.comboPrice !== undefined &&
    (!Number.isFinite(dto.comboPrice) || dto.comboPrice < 0)
  ) {
    throw new BadRequestException(
      'Producto: el precio del combo no puede ser negativo',
    );
  }

  const effectiveIsCombo = dto.isCombo ?? current?.isCombo ?? false;
  if (effectiveIsCombo && dto.hasMultipleSizes === true) {
    throw new BadRequestException(
      'Producto: un combo no puede tener múltiples tamaños',
    );
  }

  if (dto.isCombo === true) {
    dto.hasMultipleSizes = false;
    if (
      (!dto.prices || dto.prices.length === 0) &&
      dto.comboPrice !== undefined
    ) {
      dto.prices = [{ size: 'único', price: dto.comboPrice }];
    }
  }

  const effectiveHasMultipleSizes =
    dto.isCombo === true ? false : hasMultipleSizes;

  if (dto.prices) {
    validatePricesForMode(effectiveHasMultipleSizes, dto.prices, 'Producto');
    return;
  }

  if (current) {
    if (
      dto.hasMultipleSizes !== undefined &&
      dto.hasMultipleSizes !== current.hasMultipleSizes
    ) {
      validatePricesForMode(
        effectiveHasMultipleSizes,
        current.prices,
        'Producto',
      );
    } else if (dto.isCombo === true && current.hasMultipleSizes) {
      validatePricesForMode(false, current.prices, 'Producto');
    }
  }
}
