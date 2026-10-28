-- These two tables were present in schema.prisma and some existing databases,
-- but were not part of the tracked migration history. Create them first so a
-- clean `prisma migrate deploy` and an existing installation are both safe.
CREATE TABLE IF NOT EXISTS "Notification" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "role" "UserRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "targetUsername" TEXT,
    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "HiddenKitchenTicket" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "hiddenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hiddenBy" TEXT,
    CONSTRAINT "HiddenKitchenTicket_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Notification"
ADD COLUMN IF NOT EXISTS "orderId" TEXT;

ALTER TABLE "HiddenKitchenTicket"
ADD COLUMN IF NOT EXISTS "orderId" TEXT,
ADD COLUMN IF NOT EXISTS "sentAt" TIMESTAMP(3);

-- Legacy ticket IDs use `<order UUID>-<sent timestamp in milliseconds>`.
-- Only rows whose extracted order still exists are linked; malformed or orphan
-- legacy rows remain readable through ticketId with a null relation.
UPDATE "HiddenKitchenTicket" AS h
SET
    "orderId" = regexp_replace(h."ticketId", '-[0-9]{10,}$', ''),
    "sentAt" = to_timestamp(
        substring(h."ticketId" from '([0-9]{10,})$')::double precision / 1000
    ) AT TIME ZONE 'UTC'
WHERE h."orderId" IS NULL
  AND h."ticketId" ~ '-[0-9]{10,}$'
  AND EXISTS (
      SELECT 1
      FROM "Order" AS o
      WHERE o."id" = regexp_replace(h."ticketId", '-[0-9]{10,}$', '')
  );

CREATE UNIQUE INDEX IF NOT EXISTS "HiddenKitchenTicket_ticketId_key"
ON "HiddenKitchenTicket"("ticketId");
CREATE INDEX IF NOT EXISTS "HiddenKitchenTicket_orderId_idx"
ON "HiddenKitchenTicket"("orderId");
CREATE INDEX IF NOT EXISTS "HiddenKitchenTicket_hiddenAt_idx"
ON "HiddenKitchenTicket"("hiddenAt");

CREATE INDEX IF NOT EXISTS "Notification_role_idx" ON "Notification"("role");
CREATE INDEX IF NOT EXISTS "Notification_targetUsername_idx"
ON "Notification"("targetUsername");
CREATE INDEX IF NOT EXISTS "Notification_isRead_idx"
ON "Notification"("isRead");
CREATE INDEX IF NOT EXISTS "Notification_createdAt_idx"
ON "Notification"("createdAt");
CREATE INDEX IF NOT EXISTS "Notification_orderId_idx"
ON "Notification"("orderId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'Notification_orderId_fkey'
    ) THEN
        ALTER TABLE "Notification"
        ADD CONSTRAINT "Notification_orderId_fkey"
        FOREIGN KEY ("orderId") REFERENCES "Order"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'HiddenKitchenTicket_orderId_fkey'
    ) THEN
        ALTER TABLE "HiddenKitchenTicket"
        ADD CONSTRAINT "HiddenKitchenTicket_orderId_fkey"
        FOREIGN KEY ("orderId") REFERENCES "Order"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
