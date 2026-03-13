import prisma from '../../lib/prisma.js';

export class CartServiceError extends Error {
  code:
    | 'INVALID_INPUT'
    | 'INVALID_QTY'
    | 'PRODUCT_NOT_FOUND'
    | 'VARIANT_NOT_FOUND'
    | 'NOT_ENOUGH_STOCK'
    | 'ITEM_NOT_FOUND';

  constructor(code: CartServiceError['code'], message?: string) {
    super(message ?? code);
    this.code = code;
  }
}

export async function addCartItem(input: {
  customerId: string;
  tenantId: string;
  storeId: string;
  productId: string;
  variantId: string | null;
  qty: number;
}) {
  const { customerId, tenantId, storeId, productId, variantId, qty } = input;

  if (!productId || !Number.isInteger(qty) || qty <= 0 || qty > 100) {
    throw new CartServiceError('INVALID_INPUT', 'Invalid quantity or product');
  }

  const product = await prisma.product.findFirst({
    where: { id: productId, tenantId, isActive: true },
    include: { variants: true },
  });
  if (!product) {
    throw new CartServiceError('PRODUCT_NOT_FOUND', 'Product not found');
  }

  const variant = variantId ? product.variants.find((v: any) => v.id === variantId && v.isActive) : null;
  if (variantId && !variant) {
    throw new CartServiceError('VARIANT_NOT_FOUND', 'Variant not found');
  }

  const existing = await prisma.cartItem.findFirst({
    where: {
      customerId,
      storeId,
      productId,
      variantId: variantId || null,
    },
  });

  const newQty = existing ? existing.qty + qty : qty;
  const availableStock = variant ? variant.stockQty : product.stockQty;
  if (availableStock < newQty) {
    throw new CartServiceError('NOT_ENOUGH_STOCK', 'Not enough stock');
  }

  if (existing) {
    await prisma.cartItem.update({ where: { id: existing.id }, data: { qty: newQty } });
  } else {
    await prisma.cartItem.create({
      data: {
        customerId,
        storeId,
        productId,
        variantId,
        qty,
      },
    });
  }

  return { message: 'Added to cart' };
}

export async function updateCartItemQty(input: {
  customerId: string;
  itemId: string;
  qty: number;
}) {
  const { customerId, itemId, qty } = input;

  if (!Number.isInteger(qty) || qty < 0 || qty > 100) {
    throw new CartServiceError('INVALID_QTY', 'Invalid quantity');
  }

  const item = await prisma.cartItem.findFirst({ where: { id: itemId, customerId } });
  if (!item) {
    throw new CartServiceError('ITEM_NOT_FOUND', 'Item not found');
  }

  if (qty <= 0) {
    await prisma.cartItem.delete({ where: { id: itemId } });
    return { message: 'Item removed' };
  }

  const product = await prisma.product.findUnique({
    where: { id: item.productId },
    include: { variants: true },
  });
  if (!product || !product.isActive) {
    throw new CartServiceError('PRODUCT_NOT_FOUND', 'Product not found');
  }

  const variant = item.variantId ? product.variants.find((v: any) => v.id === item.variantId && v.isActive) : null;
  if (item.variantId && !variant) {
    throw new CartServiceError('VARIANT_NOT_FOUND', 'Variant not found');
  }

  const availableStock = variant ? variant.stockQty : product.stockQty;
  if (availableStock < qty) {
    throw new CartServiceError('NOT_ENOUGH_STOCK', 'Not enough stock');
  }

  await prisma.cartItem.update({ where: { id: itemId }, data: { qty } });
  return { message: 'Cart updated' };
}

export async function removeCartItem(input: { customerId: string; itemId: string }) {
  const item = await prisma.cartItem.findFirst({ where: { id: input.itemId, customerId: input.customerId } });
  if (!item) {
    throw new CartServiceError('ITEM_NOT_FOUND', 'Item not found');
  }

  await prisma.cartItem.delete({ where: { id: input.itemId } });
  return { message: 'Item removed' };
}
