import prisma from '../../lib/prisma.js';

/**
 * B2B order creation (docs/B2B_COUNTERPARTIES.md §13 step 5).
 *
 * A deliberately NEW, separate function — not a branch bolted onto
 * apps/api/src/modules/bot/checkout.service.ts's createShopCheckoutOrder
 * (§6.1 of the doc explicitly calls for this: that file is Telegram-only,
 * and a shared function with an optional-customer branch is exactly what
 * was rejected there). Loyalty/promo/cart concepts from that flow simply
 * don't apply to a B2B order, so nothing from it is reused beyond the
 * *pattern* for orderNumber generation and stock decrement, replicated
 * here rather than extracted into a shared helper — checkout.service.ts
 * is a hot, battle-tested path and this step's scope is this module only.
 *
 * RESOLVED (was an open question in the doc): stock is decremented
 * through the exact same Product/ProductVariant.stockQty +
 * StockMovement mechanism as Telegram orders and POS sales — one shared
 * warehouse, one shared number, regardless of channel.
 */

const errorCodes = [
  'EMPTY_ORDER',
  'COUNTERPARTY_NOT_FOUND',
  'COUNTERPARTY_INACTIVE',
  'STORE_NOT_FOUND',
  'PRODUCT_NOT_FOUND',
  'VARIANT_NOT_FOUND',
  'INVALID_QUANTITY',
  'INSUFFICIENT_STOCK',
] as const;
type CounterpartyOrderErrorCode = (typeof errorCodes)[number];

// Same convention as order.service.ts's plain Error + colon-delimited
// code (e.g. 'BAD_TRANSITION:from:to') — no new error-handling mechanism.
export class CounterpartyOrderError extends Error {
  code: CounterpartyOrderErrorCode;
  detail?: string;

  constructor(code: CounterpartyOrderErrorCode, detail?: string) {
    super(detail ? `${code}:${detail}` : code);
    this.code = code;
    this.detail = detail;
  }
}

export type CreateB2BOrderInput = {
  tenantId: string;
  storeId: string;
  counterpartyId: string;
  actorUserId?: string;
  items: Array<{ productId: string; variantId?: string | null; qty: number }>;
  deliveryType: 'PICKUP' | 'LOCAL' | 'NATIONAL';
  deliveryAddress?: string;
  deliveryPrice?: number;
  note?: string;
  // Due date = order date + paymentTermDays (docs/B2B_COUNTERPARTIES.md
  // §7) — configurable per call, not hardcoded, default 30 ("net 30").
  paymentTermDays?: number;
};

export async function createB2BOrder(input: CreateB2BOrderInput) {
  const { tenantId, storeId, counterpartyId, actorUserId, items, deliveryType, note } = input;
  const deliveryAddress = input.deliveryAddress ?? null;
  const deliveryPrice = input.deliveryPrice ?? 0;
  const paymentTermDays = input.paymentTermDays ?? 30;

  if (items.length === 0) throw new CounterpartyOrderError('EMPTY_ORDER');

  const counterparty = await prisma.counterparty.findFirst({ where: { id: counterpartyId, tenantId } });
  if (!counterparty) throw new CounterpartyOrderError('COUNTERPARTY_NOT_FOUND');
  if (!counterparty.isActive) throw new CounterpartyOrderError('COUNTERPARTY_INACTIVE');

  const store = await prisma.store.findFirst({ where: { id: storeId, tenantId }, select: { id: true } });
  if (!store) throw new CounterpartyOrderError('STORE_NOT_FOUND');

  const productIds = [...new Set(items.map((i) => i.productId))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, tenantId, isActive: true },
    include: { variants: true },
  });
  const productMap = new Map(products.map((p) => [p.id, p]));

  // §4 price resolution needs every CounterpartyPrice row that could
  // apply to this order's products, keyed by (productId, variantId) —
  // variantId is part of the key even when null (a non-variant product's
  // override has variantId = NULL, same partial-index shape as the
  // schema itself, docs/B2B_COUNTERPARTIES.md §5.2/§12.3).
  const counterpartyPrices = productIds.length
    ? await prisma.counterpartyPrice.findMany({ where: { counterpartyId, productId: { in: productIds } } })
    : [];
  const priceKey = (productId: string, variantId: string | null) => `${productId}:${variantId ?? ''}`;
  const cpPriceMap = new Map(counterpartyPrices.map((p) => [priceKey(p.productId, p.variantId), p]));

  type PreparedItem = {
    productId: string;
    variantId: string | null;
    name: string;
    variantName: string | null;
    price: number;
    qty: number;
    total: number;
  };
  const orderItems: PreparedItem[] = [];
  let subtotal = 0;

  for (const item of items) {
    if (!Number.isInteger(item.qty) || item.qty <= 0) {
      throw new CounterpartyOrderError('INVALID_QUANTITY', item.productId);
    }
    const product = productMap.get(item.productId);
    if (!product) throw new CounterpartyOrderError('PRODUCT_NOT_FOUND', item.productId);

    const variantId = item.variantId ?? null;
    const variant = variantId ? (product as any).variants.find((v: any) => v.id === variantId && v.isActive) : null;
    if (variantId && !variant) throw new CounterpartyOrderError('VARIANT_NOT_FOUND', variantId);

    // §4: CounterpartyPrice for (counterpartyId, productId, variantId) →
    // else the variant's own price (if it has one) → else Product.price.
    const cpPrice = cpPriceMap.get(priceKey(item.productId, variantId));
    const price = cpPrice ? Number(cpPrice.price) : variant?.price != null ? Number(variant.price) : Number(product.price);
    const itemTotal = price * item.qty;

    orderItems.push({
      productId: product.id,
      variantId,
      name: product.name,
      variantName: variant?.name ?? null,
      price,
      qty: item.qty,
      total: itemTotal,
    });
    subtotal += itemTotal;
  }

  const total = subtotal + deliveryPrice;

  const order = await prisma.$transaction(async (tx: any) => {
    // Same advisory lock as Telegram checkout (bot/checkout.service.ts) —
    // orderNumber is @@unique([tenantId, orderNumber]), shared across every
    // sales channel in a tenant, so B2B must serialize against concurrent
    // Telegram checkouts on the exact same lock key, not a separate one.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}))`;

    // Re-validate stock inside the lock — the pre-transaction read above
    // can be stale by the time this order actually gets the lock (same
    // reasoning as checkout.service.ts). Unlike POS (docs/POS_SYNC_API.md
    // §18 — a sale already happened at the till, so negative stock there
    // is an honest oversell signal, never blocked), a B2B order is created
    // BEFORE the goods leave the warehouse, exactly like a Telegram
    // checkout — so insufficient stock blocks order creation here too.
    const freshProducts = await tx.product.findMany({
      where: { id: { in: orderItems.map((i) => i.productId) } },
      include: { variants: true },
    });
    const freshMap = new Map<string, any>(freshProducts.map((p: any) => [p.id, p]));
    for (const item of orderItems) {
      const fp = freshMap.get(item.productId);
      if (!fp) throw new CounterpartyOrderError('PRODUCT_NOT_FOUND', item.productId);
      const fv = item.variantId ? fp.variants.find((v: any) => v.id === item.variantId && v.isActive) : null;
      const stock = fv ? fv.stockQty : fp.stockQty;
      if (stock < item.qty) throw new CounterpartyOrderError('INSUFFICIENT_STOCK', item.name);
    }

    const lastOrder = await tx.order.findFirst({ where: { tenantId }, orderBy: { orderNumber: 'desc' } });
    const orderNumber = (lastOrder?.orderNumber ?? 0) + 1;

    const now = new Date();
    const dueDate = new Date(now.getTime() + paymentTermDays * 24 * 60 * 60 * 1000);

    const newOrder = await tx.order.create({
      data: {
        tenantId,
        storeId,
        orderNumber,
        customerId: null,
        salesChannel: 'B2B',
        counterpartyId,
        status: 'NEW',
        // B2B has no online payment gateway or StorePaymentMethod lookup
        // — it's settled against CounterpartyLedger, not paid at checkout.
        // MANUAL_TRANSFER is the closest existing enum value to "settled
        // off-platform, on credit"; no new enum value added in this step.
        paymentMethod: 'MANUAL_TRANSFER',
        paymentStatus: 'PENDING',
        deliveryType,
        deliveryAddress,
        deliveryPrice,
        subtotal,
        total,
        note: note ?? null,
        items: { create: orderItems },
      },
      include: { items: true },
    });

    await tx.orderStatusLog.create({
      data: { orderId: newOrder.id, toStatus: 'NEW', changedBy: actorUserId ?? null },
    });

    // Stock decrement — mirrors bot/checkout.service.ts's block exactly
    // (same atomic decrement + StockMovement shape, one shared warehouse
    // regardless of channel). StockMovement has no channel/source column
    // (unchanged in this step) — a B2B order is only distinguishable from
    // a Telegram order in this audit trail by this note text.
    for (const item of orderItems) {
      if (item.variantId) {
        const updated = await tx.productVariant.update({
          where: { id: item.variantId },
          data: { stockQty: { decrement: item.qty } },
          select: { stockQty: true },
        });
        await tx.stockMovement.create({
          data: {
            tenantId,
            productId: item.productId,
            variantId: item.variantId,
            delta: -item.qty,
            qtyBefore: updated.stockQty + item.qty,
            qtyAfter: updated.stockQty,
            note: `B2B order #${orderNumber} placed`,
          },
        });
      } else {
        const updated = await tx.product.update({
          where: { id: item.productId },
          data: { stockQty: { decrement: item.qty } },
          select: { stockQty: true },
        });
        await tx.stockMovement.create({
          data: {
            tenantId,
            productId: item.productId,
            delta: -item.qty,
            qtyBefore: updated.stockQty + item.qty,
            qtyAfter: updated.stockQty,
            note: `B2B order #${orderNumber} placed`,
          },
        });
      }
    }

    // Debt ledger — same atomic cached-total + append-only-ledger-row
    // pattern as applyStockDelta()/StockLedgerEntry (pos-sync/routes.ts),
    // applied to money instead of stock (docs/B2B_COUNTERPARTIES.md §7).
    await tx.counterparty.update({
      where: { id: counterpartyId },
      data: { currentDebt: { increment: total } },
    });
    await tx.counterpartyLedger.create({
      data: {
        tenantId,
        counterpartyId,
        type: 'ORDER_CHARGE',
        delta: total,
        orderId: newOrder.id,
        originalDueDate: dueDate,
        dueDate,
      },
    });

    return newOrder;
  });

  return order;
}
