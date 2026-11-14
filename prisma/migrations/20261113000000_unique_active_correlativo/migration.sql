-- Deduplicate any legacy active correlativos per documentType (keeping only the
-- most recent one) so the partial unique index creation succeeds cleanly.
WITH ranked_active_correlativos AS (
  SELECT "id",
         ROW_NUMBER() OVER (
           PARTITION BY "documentType"
           ORDER BY "createdAt" DESC, "id" DESC
         ) AS rn
  FROM "Correlativo"
  WHERE "status" = 'ACTIVO'
)
UPDATE "Correlativo"
SET "status" = 'VENCIDO'
WHERE "id" IN (
  SELECT "id" FROM ranked_active_correlativos WHERE rn > 1
);

-- Guarantees at most one active correlativo per documentType at the database
-- level even under concurrent auto-creation or administration updates.
CREATE UNIQUE INDEX IF NOT EXISTS "Correlativo_one_active_per_document_type_idx"
ON "Correlativo"("documentType")
WHERE "status" = 'ACTIVO';
