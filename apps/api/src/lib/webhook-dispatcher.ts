import { createHmac, randomBytes } from 'crypto';
import { lookup } from 'dns/promises';
import prisma from './prisma.js';
import { isUnsafeResolvedAddress } from './ssrf-guard.js';

// A webhook URL's hostname passes SSRF validation once, at create/update
// time (webhook/routes.ts's isSafeWebhookUrl) — but a tenant fully controls
// their own DNS, so a hostname that was public then can be repointed at an
// internal address (169.254.169.254, a container's own IP, …) at any point
// after that, before the next delivery actually fires. Re-resolving and
// re-checking here, right before each attempt, is what actually closes
// that window rather than just checking once and trusting the stored URL
// forever.
async function assertPublicHost(rawHostname: string): Promise<void> {
  // URL.hostname keeps brackets around an IPv6 literal ("[::1]"); dns.lookup
  // doesn't accept that form (it treats it as an unresolvable name), so
  // strip them before resolving — otherwise a stored IPv6-literal webhook
  // URL fails as a generic network error instead of being classified (and
  // logged) as the SSRF block it actually is.
  const hostname = rawHostname.replace(/^\[|\]$/g, '');
  const records = await lookup(hostname, { all: true });
  if (records.length === 0) throw new Error('DNS resolution returned no addresses');
  for (const { address } of records) {
    if (isUnsafeResolvedAddress(address)) {
      throw new Error(`refusing to deliver: ${hostname} resolves to a private/internal address (${address})`);
    }
  }
}

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
      let delivered = false;
      let blocked = false;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          if (attempt > 0) await new Promise((r) => setTimeout(r, 3000));
          await assertPublicHost(new URL(hook.url).hostname);
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
          if (res.ok) { delivered = true; break; }
        } catch (err) {
          // A DNS-resolution block is deterministic within this delivery
          // window — retrying after 3s won't change what the hostname
          // resolves to, so stop instead of burning the retry on it.
          if (err instanceof Error && err.message.startsWith('refusing to deliver')) {
            blocked = true;
            console.warn('[webhook] delivery blocked — target resolves to a private address', { hookId: hook.id, event, eventId, reason: err.message });
            break;
          }
          // network/timeout error — will retry once
        }
      }
      if (!delivered && !blocked) {
        console.warn('[webhook] delivery failed after retries', { hookId: hook.id, event, eventId });
      }
    })();
  }
}
