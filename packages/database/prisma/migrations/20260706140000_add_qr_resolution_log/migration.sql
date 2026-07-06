-- E08-T5: traza consultable de cada resolución del enrutador de QR (Épica 8).
-- Cada escaneo de /n/{opaqueId} deja una fila: a qué número resolvió (o PWA) y por qué.

-- CreateEnum
CREATE TYPE "QrResolutionReason" AS ENUM ('PRIMARY', 'FAILOVER', 'FALLBACK_PWA');

-- CreateTable
CREATE TABLE "qr_resolution_logs" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "waNumberId" TEXT,
    "reason" "QrResolutionReason" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qr_resolution_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "qr_resolution_logs_businessId_createdAt_idx" ON "qr_resolution_logs"("businessId", "createdAt");

-- AddForeignKey
ALTER TABLE "qr_resolution_logs" ADD CONSTRAINT "qr_resolution_logs_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_resolution_logs" ADD CONSTRAINT "qr_resolution_logs_waNumberId_fkey" FOREIGN KEY ("waNumberId") REFERENCES "wa_numbers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
