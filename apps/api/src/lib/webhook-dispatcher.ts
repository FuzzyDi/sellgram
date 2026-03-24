import { createHmac, randomBytes } from 'crypto';
import prisma from './prisma.js';

export type WebhookEventType =
  | 'order.created'
  | 'order.status_changed'
  | 'order.paid'
  | 'customer.created';

export async function dispatchWebhook(tenantId: string, event: WebhookEventType, data: unknown) {
  const hooks = await prisma.webhook.findMany({
    where: { tenantId, isActive: true },
    select: { id: true, url: true, events: true, secret: true },
  });
  if (hooks.length === 0) return;

  const timestamp = Math.floor(Date.now() / 1000);
  const eventId = 'evt_' + randomBytes(12).toString('hex');
  const payload = JSON.stringify({ id: eventId, event, tenantId, timestamp, data });

  for (const hook of hooks) {
    const subscribed = hook.events as string[];
    if (!subscribed.includes('*') && !subscribed.includes(event)) continue;

    const signature = 'sha256=' + createHmac('sha256', hook.secret).update(payload).digest('hex');

    // Fire-and-forget with one retry after 3 s
    void (async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          if (attempt > 0) await new Promise((r) => setTimeout(r, 3000));
          const res = await fetch(hook.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Sellgram-Signature': signature,
              'X-Sellgram-Event': event,
              'X-Sellgram-Delivery': eventId,
            },
            body: payload,
            signal: AbortSignal.timeout(10_000),
          });
          if (res.ok) break;
        } catch {
          // ignore delivery failures
        }
      }
    })();
  }
}
