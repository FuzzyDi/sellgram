import prisma from '../lib/prisma.js';
import { sendMessageToOwner } from '../bot/bot-manager.js';

const OFFLINE_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes
const REALERT_INTERVAL_MS = 60 * 60 * 1000; // 1 hour — repeat nag cadence while still offline

function minutesSince(date: Date, now: Date): number {
  return Math.floor((now.getTime() - date.getTime()) / 60_000);
}

// Finds active devices that have gone quiet (heartbeat comes in on every
// GET /pos/v1/heartbeat, pos-sync/routes.ts) and messages the tenant owner
// via Telegram. alertSentAt is the dedup flag: null or older than
// REALERT_INTERVAL_MS is "ok to alert again", anything more recent means
// we already nagged this cycle and stay quiet. It's cleared back to null
// by the heartbeat handler itself the moment the device checks back in,
// so a device that recovers and drops again always gets a fresh alert
// rather than staying silenced by a stale timestamp.
export async function checkOfflineDevices(): Promise<void> {
  const now = new Date();
  const offlineCutoff = new Date(now.getTime() - OFFLINE_THRESHOLD_MS);
  const realertCutoff = new Date(now.getTime() - REALERT_INTERVAL_MS);

  const devices = await prisma.posDevice.findMany({
    where: {
      status: 'ACTIVE',
      lastSeenAt: { lt: offlineCutoff },
      OR: [{ alertSentAt: null }, { alertSentAt: { lt: realertCutoff } }],
    },
    select: {
      id: true,
      name: true,
      tenantId: true,
      lastSeenAt: true,
      store: { select: { name: true } },
    },
  });

  if (devices.length === 0) return;

  for (const device of devices) {
    try {
      const owner = await prisma.user.findFirst({
        where: { tenantId: device.tenantId, role: 'OWNER', isActive: true, adminTelegramId: { not: null } },
        select: { adminTelegramId: true },
      });
      if (!owner?.adminTelegramId) continue;

      const minutes = minutesSince(device.lastSeenAt!, now);
      const lastSeenLabel = device.lastSeenAt!.toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent' });
      const message =
        `⚠️ Касса ${device.name} (магазин ${device.store.name}) не выходит на связь уже ${minutes} минут. ` +
        `Последний heartbeat: ${lastSeenLabel}.`;

      const sent = await sendMessageToOwner(device.tenantId, owner.adminTelegramId as bigint, message);
      // Only stamp alertSentAt on a confirmed send — a failed send (bot
      // instance missing, Telegram API error) should be retried next
      // cycle, not silently treated as "already alerted".
      if (sent) {
        await prisma.posDevice.update({ where: { id: device.id }, data: { alertSentAt: now } });
      }
    } catch (err) {
      console.error(`[pos-device-monitor] failed for device ${device.id}:`, err);
    }
  }
}

export function startPosDeviceMonitor(): void {
  // Run once shortly after startup, then every 5 minutes — same
  // simplest-thing-that-works setInterval shape as
  // jobs/scheduled-reports.ts's startScheduledReportsRunner.
  setTimeout(() => void checkOfflineDevices(), 60_000);
  setInterval(() => void checkOfflineDevices(), 5 * 60 * 1000);
}
