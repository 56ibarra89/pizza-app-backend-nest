ALTER TABLE "SystemLog"
ADD COLUMN "module" TEXT,
ADD COLUMN "operation" TEXT,
ADD COLUMN "entity" TEXT,
ADD COLUMN "entityId" TEXT,
ADD COLUMN "source" TEXT,
ADD COLUMN "requestId" TEXT,
ADD COLUMN "ipAddress" TEXT,
ADD COLUMN "userAgent" TEXT,
ADD COLUMN "httpMethod" TEXT,
ADD COLUMN "route" TEXT,
ADD COLUMN "statusCode" INTEGER,
ADD COLUMN "success" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "durationMs" INTEGER,
ADD COLUMN "before" JSONB,
ADD COLUMN "after" JSONB,
ADD COLUMN "metadata" JSONB;

CREATE INDEX "SystemLog_module_idx" ON "SystemLog"("module");
CREATE INDEX "SystemLog_operation_idx" ON "SystemLog"("operation");
CREATE INDEX "SystemLog_entity_entityId_idx" ON "SystemLog"("entity", "entityId");
CREATE INDEX "SystemLog_success_idx" ON "SystemLog"("success");
CREATE INDEX "SystemLog_requestId_idx" ON "SystemLog"("requestId");
