import { PrismaClient } from '@prisma/client';
import { getPaymentProvider } from './registry.js';
import { PaymentPreparationInput, PaymentPreparationResult, StoreProviderCode } from './types.js';

export function prepareOrderPayment(input: PaymentPreparationInput): PaymentPreparationResult {
  const handler = getPaymentProvider(input.method.provider as StoreProviderCode);
  return handler.prepare(input);
}

type MutablePaymentStatus = 'PENDING' | 'PAID' | 'REFUNDED';

function canTransitionPaymentStatus(from: MutablePaymentStatus, to: MutablePaymentStatus) {
  if (from === to) return true;
  if (from === 'PENDING' && to === 'PAID') return true;
  if (from === 'PAID' && to === 'REFUNDED') return true;
  return false;
}

export async function applyOrderPaymentStatus(
  prisma: PrismaClient,
  input: {
    orderId: string;
    tenantId?: string;
    status: MutablePaymentStatus;
    paymentRef?: string;
    metaPatch?: Record<string, any>;
  }
) {
  const order = await prisma.order.findFirst({
    where: {
      id: input.orderId,
      ...(input.tenantId ? { tenantId: input.tenantId } : {}),
    },
  });

  if (!order) {
    throw new Error('ORDER_NOT_FOUND');
  }

  const current = order.paymentStatus as MutablePaymentStatus;
  const next = input.status;

  if (!canTransitionPaymentStatus(current, next)) {
    throw new Error(`BAD_PAYMENT_TRANSITION:${current}:${next}`);
  }

  const prevMeta = (order.paymentMeta && typeof order.paymentMeta === 'object') ? (order.paymentMeta as Record<string, any>) : {};
  const mergedMeta = {
    ...prevMeta,
    ...(input.metaPatch || {}),
    ...(input.paymentRef ? { paymentRef: input.paymentRef } : {}),
    lastPaymentStatusAt: new Date().toISOString(),
  };

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: {
      paymentStatus: next,
      paymentMeta: mergedMeta,
    },
  });

  return updated;
}
