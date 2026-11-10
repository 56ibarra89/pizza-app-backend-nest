-- Retiene precisión suficiente en USD para que la conversión a NIO respete
-- la tolerancia financiera máxima de C$0.01.
ALTER TABLE "Payment"
ALTER COLUMN "originalAmount" TYPE DECIMAL(12,4);
