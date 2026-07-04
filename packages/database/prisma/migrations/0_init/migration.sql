-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'CASHIER');

-- CreateEnum
CREATE TYPE "VerdictStatus" AS ENUM ('VERIFIED', 'PENDING', 'SUSPICIOUS');

-- CreateEnum
CREATE TYPE "MailboxStatus" AS ENUM ('PENDING', 'VERIFIED');

-- CreateEnum
CREATE TYPE "ReceiverBank" AS ENUM ('BANCOLOMBIA', 'DAVIVIENDA', 'BBVA');

-- CreateEnum
CREATE TYPE "IssuerBank" AS ENUM ('NEQUI', 'BANCOLOMBIA', 'DAVIPLATA', 'DAVIVIENDA', 'BBVA', 'BANCO_DE_BOGOTA', 'COLPATRIA');

-- CreateEnum
CREATE TYPE "BankEmailStatus" AS ENUM ('PARSED', 'UNPARSED');

-- CreateEnum
CREATE TYPE "NumberHealth" AS ENUM ('WARMING', 'CONNECTED', 'DEGRADED', 'BANNED');

-- CreateTable
CREATE TABLE "businesses" (
    "id" TEXT NOT NULL,
    "opaqueId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "inboundMailboxId" TEXT NOT NULL,
    "mailboxStatus" "MailboxStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "businesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "supabaseUserId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receiving_accounts" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "bank" "ReceiverBank" NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "alias" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receiving_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vouchers" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "issuerBank" "IssuerBank",
    "amountCents" INTEGER,
    "approvalNumber" TEXT,
    "paidAt" TIMESTAMP(3),
    "destinationAccount" TEXT,
    "beneficiary" TEXT,
    "storagePath" TEXT,
    "ocrText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vouchers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "voucherId" TEXT NOT NULL,
    "verdict" "VerdictStatus" NOT NULL DEFAULT 'PENDING',
    "amountCents" INTEGER NOT NULL,
    "approvalNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_sources" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_emails" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "bank" "ReceiverBank",
    "parserVersion" TEXT,
    "status" "BankEmailStatus" NOT NULL DEFAULT 'UNPARSED',
    "rawContent" TEXT NOT NULL,
    "amountCents" INTEGER,
    "approvalNumber" TEXT,
    "occurredAt" TIMESTAMP(3),
    "destinationAccount" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_emails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_numbers" (
    "id" TEXT NOT NULL,
    "bank" TEXT NOT NULL,
    "approvalNumber" TEXT NOT NULL,
    "firstBusinessId" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_numbers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wa_numbers" (
    "id" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "health" "NumberHealth" NOT NULL DEFAULT 'WARMING',
    "warmupStartedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wa_numbers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wa_sessions" (
    "id" TEXT NOT NULL,
    "waNumberId" TEXT NOT NULL,
    "authState" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wa_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "number_pool_assignments" (
    "id" TEXT NOT NULL,
    "waNumberId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "number_pool_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "money_op_logs" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "verdict" "VerdictStatus" NOT NULL,
    "evidenceSources" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "money_op_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "businesses_opaqueId_key" ON "businesses"("opaqueId");

-- CreateIndex
CREATE UNIQUE INDEX "businesses_inboundMailboxId_key" ON "businesses"("inboundMailboxId");

-- CreateIndex
CREATE UNIQUE INDEX "users_supabaseUserId_key" ON "users"("supabaseUserId");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "memberships_businessId_idx" ON "memberships"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_userId_businessId_key" ON "memberships"("userId", "businessId");

-- CreateIndex
CREATE INDEX "receiving_accounts_businessId_idx" ON "receiving_accounts"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "receiving_accounts_businessId_bank_accountNumber_key" ON "receiving_accounts"("businessId", "bank", "accountNumber");

-- CreateIndex
CREATE INDEX "vouchers_businessId_idx" ON "vouchers"("businessId");

-- CreateIndex
CREATE INDEX "vouchers_businessId_approvalNumber_idx" ON "vouchers"("businessId", "approvalNumber");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_voucherId_key" ON "transactions"("voucherId");

-- CreateIndex
CREATE INDEX "transactions_businessId_idx" ON "transactions"("businessId");

-- CreateIndex
CREATE INDEX "transactions_businessId_verdict_idx" ON "transactions"("businessId", "verdict");

-- CreateIndex
CREATE INDEX "evidence_sources_transactionId_idx" ON "evidence_sources"("transactionId");

-- CreateIndex
CREATE INDEX "bank_emails_businessId_idx" ON "bank_emails"("businessId");

-- CreateIndex
CREATE INDEX "bank_emails_businessId_approvalNumber_idx" ON "bank_emails"("businessId", "approvalNumber");

-- CreateIndex
CREATE INDEX "bank_emails_businessId_amountCents_occurredAt_idx" ON "bank_emails"("businessId", "amountCents", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "approval_numbers_bank_approvalNumber_key" ON "approval_numbers"("bank", "approvalNumber");

-- CreateIndex
CREATE UNIQUE INDEX "wa_numbers_phoneNumber_key" ON "wa_numbers"("phoneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "wa_sessions_waNumberId_key" ON "wa_sessions"("waNumberId");

-- CreateIndex
CREATE INDEX "number_pool_assignments_businessId_idx" ON "number_pool_assignments"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "number_pool_assignments_waNumberId_businessId_key" ON "number_pool_assignments"("waNumberId", "businessId");

-- CreateIndex
CREATE INDEX "money_op_logs_businessId_idx" ON "money_op_logs"("businessId");

-- CreateIndex
CREATE INDEX "money_op_logs_businessId_transactionId_idx" ON "money_op_logs"("businessId", "transactionId");

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receiving_accounts" ADD CONSTRAINT "receiving_accounts_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "vouchers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_sources" ADD CONSTRAINT "evidence_sources_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_emails" ADD CONSTRAINT "bank_emails_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wa_sessions" ADD CONSTRAINT "wa_sessions_waNumberId_fkey" FOREIGN KEY ("waNumberId") REFERENCES "wa_numbers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "number_pool_assignments" ADD CONSTRAINT "number_pool_assignments_waNumberId_fkey" FOREIGN KEY ("waNumberId") REFERENCES "wa_numbers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "number_pool_assignments" ADD CONSTRAINT "number_pool_assignments_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "money_op_logs" ADD CONSTRAINT "money_op_logs_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

