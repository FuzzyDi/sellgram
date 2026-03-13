import { Queue, Worker } from 'bullmq';
import prisma from '../lib/prisma.js';
import { getConfig } from '../config/index.js';

const QUEUE_NAME = 'daily-digest';
const redisConnection = { url: getConfig().REDIS_URL };

export function createDailyDigestQueue(): Queue {
  return new Queue(QUEUE_NAME, { connection: redisConnection });
}

export function createDailyDigestWorker(): Worker {
  return new Worker(
    QUEUE_NAME,
    async (_job) => {
      console.log('[DailyDigest] Running...');

      const stores = await prisma.store.findMany({
        where: { isActive: true },
        include: { tenant: true },
      });

      for (const store of stores) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [todayOrders, todayRevenue, newCustomers] = await Promise.all([
          prisma.order.count({
            where: { tenantId: store.tenantId, storeId: store.id, createdAt: { gte: today } },
          }),
          prisma.order.aggregate({
            where: {
              tenantId: store.tenantId,
              storeId: store.id,
              status: { in: ['COMPLETED', 'DELIVERED'] },
              createdAt: { gte: today },
            },
            _sum: { total: true },
          }),
          prisma.customer.count({
            where: { tenantId: store.tenantId, createdAt: { gte: today } },
          }),
        ]);

        const allProducts = await prisma.product.findMany({
          where: { tenantId: store.tenantId, isActive: true },
          select: { name: true, stockQty: true, lowStockAlert: true },
        });

        const lowStockProducts = allProducts
          .filter((p: { stockQty: number; lowStockAlert: number }) => p.stockQty > 0 && p.stockQty <= p.lowStockAlert)
          .slice(0, 5);

        const revenue = Number(todayRevenue._sum.total) || 0;

        const digest = [
          `?? Daily report - ${new Date().toLocaleDateString('uz-UZ')}`,
          '',
          `?? Revenue: ${revenue.toLocaleString()} UZS`,
          `?? Orders today: ${todayOrders}`,
          `?? New customers: ${newCustomers}`,
        ];

        if (lowStockProducts.length > 0) {
          digest.push('', '?? Low stock:');
          lowStockProducts.forEach((p: any) => {
            digest.push(`  • ${p.name}: ${p.stockQty} pcs`);
          });
        }

        console.log(`[DailyDigest] Store ${store.name}:\n${digest.join('\n')}`);
        // TODO: Send via bot to store owner when notify_chat_id is configured
      }
    },
    { connection: redisConnection }
  );
}
