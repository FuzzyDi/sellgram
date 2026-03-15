import { Queue, Worker } from 'bullmq';
import prisma from '../lib/prisma.js';
import { getConfig } from '../config/index.js';
import { getBot } from '../bot/bot-manager.js';

const QUEUE_NAME = 'daily-digest';
const redisConnection = { url: getConfig().REDIS_URL };

export function createDailyDigestQueue(): Queue {
  return new Queue(QUEUE_NAME, { connection: redisConnection });
}

export function createDailyDigestWorker(): Worker {
  return new Worker(
    QUEUE_NAME,
    async (_job) => {
      const stores = await prisma.store.findMany({
        where: { isActive: true },
        include: { tenant: { include: { users: { where: { role: 'OWNER', adminTelegramId: { not: null } } } } } },
      });

      const now = new Date();
      const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

      for (const store of stores) {
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

        const lines = [
          `📊 Daily report — ${new Date().toLocaleDateString('uz-UZ')}`,
          `🏪 ${store.name}`,
          '',
          `💰 Revenue: ${revenue.toLocaleString()} UZS`,
          `🛍️ Orders today: ${todayOrders}`,
          `👥 New customers: ${newCustomers}`,
        ];

        if (lowStockProducts.length > 0) {
          lines.push('', '⚠️ Low stock:');
          lowStockProducts.forEach((p: { name: string; stockQty: number }) => {
            lines.push(`  📦 ${p.name}: ${p.stockQty} pcs`);
          });
        }

        const text = lines.join('\n');

        // Send to all OWNER users who have linked their Telegram account
        const bot = getBot(store.id);
        if (bot) {
          for (const user of store.tenant.users) {
            if (!user.adminTelegramId) continue;
            await bot.api.sendMessage(user.adminTelegramId.toString(), text).catch(() => {});
          }
        }
      }
    },
    { connection: redisConnection }
  );
}
