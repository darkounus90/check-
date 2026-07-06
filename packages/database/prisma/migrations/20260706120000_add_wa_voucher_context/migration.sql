-- CreateTable
CREATE TABLE "wa_voucher_contexts" (
    "id" TEXT NOT NULL,
    "voucherId" TEXT NOT NULL,
    "remoteJid" TEXT NOT NULL,
    "waNumberId" TEXT NOT NULL,
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wa_voucher_contexts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wa_voucher_contexts_voucherId_key" ON "wa_voucher_contexts"("voucherId");

-- CreateIndex
CREATE INDEX "wa_voucher_contexts_waNumberId_idx" ON "wa_voucher_contexts"("waNumberId");

-- AddForeignKey
ALTER TABLE "wa_voucher_contexts" ADD CONSTRAINT "wa_voucher_contexts_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "vouchers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_voucher_contexts" ADD CONSTRAINT "wa_voucher_contexts_waNumberId_fkey" FOREIGN KEY ("waNumberId") REFERENCES "wa_numbers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
