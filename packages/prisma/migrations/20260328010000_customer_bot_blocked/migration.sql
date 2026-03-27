-- Track customers who have blocked the bot to skip future sends
ALTER TABLE "customers" ADD COLUMN "botBlocked" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "customers_botBlocked_idx" ON "customers"("botBlocked") WHERE "botBlocked" = true;
