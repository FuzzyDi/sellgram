-- SaleEvent/StockEvent.idempotencyKey was globally unique, unlike every
-- sibling POS event stream (FiscalEvent/ShiftEvent: [deviceId, eventId];
-- PosOperatorEvent/PosPaymentEvent: [deviceId, idempotencyKey]). A
-- client-generated key colliding across two different tenants' devices
-- would silently reject one tenant's legitimate sale/stock event. Since the
-- old constraint was strictly stronger (global uniqueness implies
-- uniqueness of any column subset, including [deviceId, idempotencyKey]),
-- no existing row can violate the new composite constraint.

-- DropIndex
DROP INDEX "sale_events_idempotencyKey_key";

-- DropIndex
DROP INDEX "stock_events_idempotencyKey_key";

-- CreateIndex
CREATE UNIQUE INDEX "sale_events_deviceId_idempotencyKey_key" ON "sale_events"("deviceId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "stock_events_deviceId_idempotencyKey_key" ON "stock_events"("deviceId", "idempotencyKey");
