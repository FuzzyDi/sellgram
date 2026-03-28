-- AlterTable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "passwordResetToken" TEXT UNIQUE;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "passwordResetExpiry" TIMESTAMP(3);
