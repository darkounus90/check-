-- E07-T6: contadores del motor de warmeo por número (límite de envíos por ventana horaria).
-- E07-T5: último índice de plantilla usado por tipo (anti-repetición consecutiva).
-- AlterTable
ALTER TABLE "wa_numbers" ADD COLUMN     "warmupHourWindowStart" TIMESTAMP(3),
ADD COLUMN     "warmupSentInWindow" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastAckTemplateIndex" INTEGER,
ADD COLUMN     "lastVerifiedTemplateIndex" INTEGER,
ADD COLUMN     "lastSuspiciousTemplateIndex" INTEGER;
