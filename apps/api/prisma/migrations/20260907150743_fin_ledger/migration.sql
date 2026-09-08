-- CreateEnum
CREATE TYPE "fin_account_type" AS ENUM ('asset', 'liability', 'income', 'expense', 'equity');

-- CreateEnum
CREATE TYPE "fin_journal_side" AS ENUM ('debit', 'credit');

-- CreateEnum
CREATE TYPE "fin_entry_kind" AS ENUM ('expense', 'income', 'transfer', 'pay_liability', 'exchange', 'split', 'opening_balance', 'reversal');

-- CreateEnum
CREATE TYPE "fin_system_account_kind" AS ENUM ('income', 'expense', 'exchange', 'opening_balance');

-- CreateTable
CREATE TABLE "fin_accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "fin_account_type" NOT NULL,
    "currency" TEXT NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "system_kind" "fin_system_account_kind",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fin_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_journal_entries" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "posted_at" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "kind" "fin_entry_kind" NOT NULL,
    "reverses_entry_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fin_journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fin_journal_lines" (
    "id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "side" "fin_journal_side" NOT NULL,
    "amount_minor" BIGINT NOT NULL,

    CONSTRAINT "fin_journal_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fin_accounts_user_id_idx" ON "fin_accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "fin_accounts_user_system_currency_key" ON "fin_accounts"("user_id", "system_kind", "currency");

-- CreateIndex
CREATE INDEX "fin_journal_entries_user_posted_idx" ON "fin_journal_entries"("user_id", "posted_at");

-- CreateIndex
CREATE INDEX "fin_journal_lines_account_id_idx" ON "fin_journal_lines"("account_id");

-- CreateIndex
CREATE INDEX "fin_journal_lines_entry_id_idx" ON "fin_journal_lines"("entry_id");

-- AddForeignKey
ALTER TABLE "fin_journal_entries" ADD CONSTRAINT "fin_journal_entries_reverses_entry_id_fkey" FOREIGN KEY ("reverses_entry_id") REFERENCES "fin_journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fin_journal_lines" ADD CONSTRAINT "fin_journal_lines_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "fin_journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fin_journal_lines" ADD CONSTRAINT "fin_journal_lines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "fin_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
