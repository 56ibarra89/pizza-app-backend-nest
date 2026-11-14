import { DocumentType, Prisma } from '@prisma/client';

const CORRELATIVO_LOCK_NAMESPACE = 'correlativo';

/**
 * Serializa dentro de la transacción operaciones que crean, activan o consumen
 * correlativos del mismo tipo documental, evitando carreras cuando aún no existe
 * una fila `ACTIVO` que pueda bloquearse con `SELECT ... FOR UPDATE`.
 */
export async function acquireCorrelativoLock(
  tx: { $executeRaw?: Prisma.TransactionClient['$executeRaw'] },
  documentType: DocumentType,
): Promise<void> {
  if (typeof tx.$executeRaw !== 'function') {
    return;
  }
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${CORRELATIVO_LOCK_NAMESPACE}), hashtext(${documentType}::text))`;
}
