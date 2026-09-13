-- Persistent authentication throttling and one-per-window reset email control.
ALTER TABLE "User"
ADD COLUMN "passwordResetRequestedAt" TIMESTAMP(3);

CREATE TABLE "AuthAttempt" (
    "key" TEXT NOT NULL,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthAttempt_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "AuthAttempt_lockedUntil_idx" ON "AuthAttempt"("lockedUntil");
CREATE INDEX "AuthAttempt_updatedAt_idx" ON "AuthAttempt"("updatedAt");
