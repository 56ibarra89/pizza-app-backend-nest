import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  ShiftCashByCurrency,
  ShiftUsdCash,
} from '../entities/shift.entity';

export function reconcileShiftCash(
  expectedCash: number,
  cashUsd: ShiftUsdCash | undefined,
  countedCash: number,
  countedUsd?: number,
) {
  const counted = new Prisma.Decimal(countedCash);
  const expectedUsd = cashUsd?.expectedUsd;
  if (countedUsd === undefined) {
    if (expectedUsd !== undefined) {
      throw new BadRequestException(
        'Indica cuánto efectivo en dólares contaste.',
      );
    }
    return {
      closingCash: counted,
      cashDifference: counted.sub(expectedCash),
      cashByCurrency: undefined,
      hasCashDifference: !counted.eq(expectedCash),
    };
  }
  if (expectedUsd === undefined || !cashUsd) {
    if (cashUsd || countedUsd !== 0) {
      throw new BadRequestException(
        'El turno no tiene datos suficientes para valorar el efectivo en dólares.',
      );
    }
    return reconcileShiftCash(expectedCash, undefined, countedCash);
  }

  const expectedNio = new Prisma.Decimal(expectedCash).sub(
    cashUsd.equivalentNio,
  );
  const usdDifference = new Prisma.Decimal(countedUsd).sub(expectedUsd);
  // Los cobros mantienen su valor liquidado. Solo se convierte la diferencia
  // de USD con la relación efectiva que dejaron los pagos de este turno.
  const countedUsdEquivalent = usdDifference
    .mul(cashUsd.equivalentNio)
    .div(expectedUsd)
    .add(cashUsd.equivalentNio)
    .toDecimalPlaces(2);
  const closingCash = counted.add(countedUsdEquivalent);
  const cashDifference = closingCash.sub(expectedCash);
  const cashByCurrency: ShiftCashByCurrency = {
    expectedNio: expectedNio.toNumber(),
    countedNio: countedCash,
    expectedUsd,
    countedUsd,
    countedUsdEquivalentNio: countedUsdEquivalent.toNumber(),
  };
  return {
    closingCash,
    cashDifference,
    cashByCurrency,
    // El vuelto en córdobas puede cambiar la composición del efectivo sin cambiar su valor.
    hasCashDifference: !cashDifference.isZero(),
  };
}
