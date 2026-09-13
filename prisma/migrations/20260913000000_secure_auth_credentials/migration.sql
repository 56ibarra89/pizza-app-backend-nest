/*
  Security migration:
  - Removes every plaintext PIN from the database.
  - Existing users must receive a new six-digit PIN from an administrator.
  - New PINs are stored as a salted scrypt hash plus a peppered lookup value.
*/
DROP INDEX IF EXISTS "User_pin_key";

ALTER TABLE "User"
DROP COLUMN "pin",
ADD COLUMN "pinHash" TEXT,
ADD COLUMN "pinLookup" TEXT;

CREATE UNIQUE INDEX "User_pinLookup_key" ON "User"("pinLookup");
