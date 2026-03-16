import { Queue, Worker } from 'bullmq';
import prisma from '../lib/prisma.js';
import { getConfig } from '../config/index.js';
import { sendPromoBroadcast } from '../bot/bot-manager.js';

const QUEUE_NAME = 'broadcast';
const redisConnection = { url: getConfig().REDIS_URL };

export type BroadcastJobData = {
  campaignId: string;
  storeId: string;
  // telegramId stored as string — BigInt is not JSON-serialisable
  recipients: Array<{ id: string; telegramId: string; firstName?: string | null }>;
  payload: { title?: string; message: string };
};

export function createBroadcastQueue(): Queue<BroadcastJobData> {
  return new Queue<BroadcastJobData>(QUEUE_NAME, { connection: redisConnection });
}

export function createBroadcastWorker(): Worker<BroadcastJobData> {
  return new Worker<BroadcastJobData>(
    QUEUE_NAME,
    async (job) => {
      const { campaignId, storeId, recipients, payload } = job.data;

      await prisma.broadcastCampaign.update({
        where: { id: campaignId },
        data: { status: 'SENDING' },
      });

      const recipientsWithBigInt = recipients.map((r) => ({
        id: r.id,
        telegramId: BigInt(r.telegramId),
        firstName: r.firstName,
      }));

      const results = await sendPromoBroadcast(storeId, recipientsWithBigInt, payload);

      await prisma.broadcastCampaign.update({
        where: { id: campaignId },
        data: {
          status: results.failed === recipients.length ? 'FAILED' : 'SENT',
          sentCount: results.sent,
          failedCount: results.failed,
          sentAt: new Date(),
        },
      });
    },
    { connection: redisConnection, concurrency: 1 }
  );
}
