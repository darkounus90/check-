-- CreateEnum
CREATE TYPE "OcrStatus" AS ENUM ('PENDING', 'PROCESSED', 'LOW_QUALITY', 'FAILED');

-- AlterTable
ALTER TABLE "vouchers" ADD COLUMN     "ocrStatus" "OcrStatus" NOT NULL DEFAULT 'PENDING';
