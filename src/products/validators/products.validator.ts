import { BadRequestException } from '@nestjs/common';
import type { CreateProductDto } from '../dto/create-product.dto';
import type { UpdateProductDto } from '../dto/update-product.dto';

function ensureUniqueSizes(prices: { size: string }[], context: string): void {
  const sizes = prices.map((p) => p.size);
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

  const hasUnico = prices.some((p) => p.size.toLowerCase() === 'unico' || p.size.toLowerCase() === 'único');

  if (hasMultipleSizes) {
    if (hasUnico) {
      throw new BadRequestException(`${context}: no se permite tamaño único cuando hay múltiples tamaños`);
    }
  } else {
    if (prices.length !== 1 || !hasUnico) {
      throw new BadRequestException(`${context}: cuando no hay múltiples tamaños, debe existir exactamente un precio con tamaño único`);
    }
  }

  for (const p of prices) {
    if (p.price < 0) {
      throw new BadRequestException(`${context}: el precio no puede ser negativo`);
    }
  }
}

export function validateCreateProduct(dto: CreateProductDto): void {
  const hasMultipleSizes = dto.hasMultipleSizes ?? false;
  validatePricesForMode(hasMultipleSizes, dto.prices, 'Producto');

  if (dto.extras?.length) {
    const names = dto.extras.map((e) => e.name.trim().toLowerCase());
    if (new Set(names).size !== names.length) {
      throw new BadRequestException('Extras: nombres duplicados');
    }

    for (const extra of dto.extras) {
      validatePricesForMode(hasMultipleSizes, extra.prices, `Extra (${extra.name})`);
    }
  }
}

export function validateUpdateProduct(
  dto: UpdateProductDto,
  hasMultipleSizes: boolean,
): void {
  if (dto.prices) {
    validatePricesForMode(hasMultipleSizes, dto.prices, 'Producto');
  }

  if (dto.extras) {
    const names = dto.extras.map((e) => e.name.trim().toLowerCase());
    if (new Set(names).size !== names.length) {
      throw new BadRequestException('Extras: nombres duplicados');
    }
    for (const extra of dto.extras) {
      validatePricesForMode(hasMultipleSizes, extra.prices, `Extra (${extra.name})`);
    }
  }
}
