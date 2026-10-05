CREATE TABLE "CategoryExtra" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CategoryExtra_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CategoryExtraPrice" (
    "id" TEXT NOT NULL,
    "extraId" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    CONSTRAINT "CategoryExtraPrice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CategoryExtra_categoryId_name_key" ON "CategoryExtra"("categoryId", "name");
CREATE INDEX "CategoryExtra_categoryId_isActive_idx" ON "CategoryExtra"("categoryId", "isActive");
CREATE UNIQUE INDEX "CategoryExtraPrice_extraId_size_key" ON "CategoryExtraPrice"("extraId", "size");

ALTER TABLE "CategoryExtra" ADD CONSTRAINT "CategoryExtra_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CategoryExtraPrice" ADD CONSTRAINT "CategoryExtraPrice_extraId_fkey"
  FOREIGN KEY ("extraId") REFERENCES "CategoryExtra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Consolida los extras existentes por categoría. Si había precios diferentes
-- para el mismo extra/tamaño, conserva el mayor para evitar cobrar de menos.
INSERT INTO "CategoryExtra" ("id", "categoryId", "name", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, p."categoryId", MIN(e."name"),
       (ROW_NUMBER() OVER (PARTITION BY p."categoryId" ORDER BY LOWER(e."name")) - 1)::integer,
       CURRENT_TIMESTAMP
FROM "ExtraIngredient" e
JOIN "Product" p ON p."id" = e."productId"
WHERE p."deletedAt" IS NULL
GROUP BY p."categoryId", LOWER(e."name");

INSERT INTO "CategoryExtraPrice" ("id", "extraId", "size", "price")
SELECT gen_random_uuid()::text, ce."id", ep."size", MAX(ep."price")
FROM "ExtraPrice" ep
JOIN "ExtraIngredient" e ON e."id" = ep."extraId"
JOIN "Product" p ON p."id" = e."productId"
JOIN "CategoryExtra" ce ON ce."categoryId" = p."categoryId" AND LOWER(ce."name") = LOWER(e."name")
WHERE p."deletedAt" IS NULL
GROUP BY ce."id", ep."size";

DROP TABLE "ExtraPrice";
DROP TABLE "ExtraIngredient";
