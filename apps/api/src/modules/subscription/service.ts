import prisma from '../../lib/prisma.js';
import { getConfig } from '../../config/index.js';
import { PLANS, type PlanCode } from '@sellgram/shared';

function buildBankDetails() {
  const config = getConfig();
  return {
    bank: config.BILLING_BANK_NAME,
    account: config.BILLING_BANK_ACCOUNT,
    recipient: config.BILLING_RECIPIENT,
    inn: config.BILLING_INN,
    mfo: config.BILLING_MFO,
    note: config.BILLING_PAYMENT_NOTE,
    email: config.BILLING_EMAIL,
  };
}

export function getSubscriptionPlans() {
  return PLANS;
}

export async function getTenantSubscription(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new Error('TENANT_NOT_FOUND');

  const plan = PLANS[tenant.plan as PlanCode];
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [storesCount, productsCount, ordersThisMonth, zonesCount] = await Promise.all([
    prisma.store.count({ where: { tenantId } }),
    prisma.product.count({ where: { tenantId, isActive: true } }),
    prisma.order.count({ where: { tenantId, createdAt: { gte: startOfMonth } } }),
    prisma.deliveryZone.count({ where: { tenantId, isActive: true } }),
  ]);

  return {
    plan: tenant.plan,
    planDetails: plan,
    planExpiresAt: tenant.planExpiresAt,
    usage: {
      stores: { current: storesCount, limit: plan.limits.maxStores },
      products: { current: productsCount, limit: plan.limits.maxProducts },
      ordersThisMonth: { current: ordersThisMonth, limit: plan.limits.maxOrdersPerMonth },
      deliveryZones: { current: zonesCount, limit: plan.limits.maxDeliveryZones },
    },
  };
}

export async function upgradeTenantPlan(input: { tenantId: string; plan: PlanCode }) {
  const bankDetails = buildBankDetails();
  const planData = PLANS[input.plan];

  if (input.plan === 'FREE') {
    await prisma.tenant.update({
      where: { id: input.tenantId },
      data: { plan: 'FREE', planExpiresAt: null },
    });

    return { message: 'Plan switched to FREE' };
  }

  const existing = await prisma.invoice.findFirst({
    where: { tenantId: input.tenantId, status: 'PENDING', plan: input.plan as any },
  });
  if (existing) {
    return { invoice: existing, bankDetails };
  }

  const invoice = await prisma.invoice.create({
    data: {
      tenantId: input.tenantId,
      plan: input.plan as any,
      amount: planData.price,
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    },
  });

  return {
    invoice,
    bankDetails,
    message: `Invoice created for ${planData.price.toLocaleString()} UZS and sent for payment.`,
  };
}

export async function listTenantInvoices(tenantId: string) {
  return prisma.invoice.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
}

export async function submitInvoicePayment(input: {
  tenantId: string;
  id: string;
  paymentRef: string;
  paymentNote?: string;
}) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: input.id, tenantId: input.tenantId, status: 'PENDING' },
  });
  if (!invoice) throw new Error('INVOICE_NOT_FOUND');

  await prisma.invoice.update({
    where: { id: input.id },
    data: { paymentRef: input.paymentRef, paymentNote: input.paymentNote },
  });
}
