import { Bot, webhookCallback, InlineKeyboard, Keyboard } from 'grammy';
import type { FastifyInstance } from 'fastify';
import type { OrderStatusType } from '@sellgram/shared';
import prisma from '../lib/prisma.js';
import { decrypt } from '../lib/encrypt.js';
import { getRedis } from '../lib/redis.js';
import { getSystemSubscriptionReminderSettings } from '../modules/system-admin/service.js';

interface BotInstance {
  bot: Bot;
  storeId: string;
  tenantId: string;
}

const bots = new Map<string, BotInstance>();



const STATUS_EMOJI: Record<OrderStatusType, string> = {
  NEW: '\u{1F195}',
  CONFIRMED: '\u2705',
  PREPARING: '\u{1F468}\u200D\u{1F373}',
  READY: '\u{1F4E6}',
  SHIPPED: '\u{1F69A}',
  DELIVERED: '\u{1F4EC}',
  COMPLETED: '\u{1F389}',
  CANCELLED: '\u274C',
  REFUNDED: '\u{1F4B8}',
};

const STATUS_LABEL_EN: Record<OrderStatusType, string> = {
  NEW: '\u041D\u043E\u0432\u044B\u0439',
  CONFIRMED: '\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D',
  PREPARING: '\u0413\u043E\u0442\u043E\u0432\u0438\u0442\u0441\u044F',
  READY: '\u0413\u043E\u0442\u043E\u0432',
  SHIPPED: '\u0412 \u043F\u0443\u0442\u0438',
  DELIVERED: '\u0414\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D',
  COMPLETED: '\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D',
  CANCELLED: '\u041E\u0442\u043C\u0435\u043D\u0435\u043D',
  REFUNDED: '\u0412\u043E\u0437\u0432\u0440\u0430\u0442',
};

const STATUS_LABEL_UZ: Record<OrderStatusType, string> = {
  NEW: 'Yangi',
  CONFIRMED: 'Tasdiqlandi',
  PREPARING: 'Tayyorlanmoqda',
  READY: 'Tayyor',
  SHIPPED: "Yo'lda",
  DELIVERED: 'Yetkazildi',
  COMPLETED: 'Yakunlandi',
  CANCELLED: 'Bekor qilindi',
  REFUNDED: 'Qaytarildi',
};

const NEXT_STATUS: Partial<Record<OrderStatusType, { status: OrderStatusType; en: string; uz: string }[]>> = {
  NEW: [
    { status: 'CONFIRMED', en: '\u2705 \u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C', uz: '\u2705 Tasdiqlash' },
    { status: 'CANCELLED', en: '\u274C \u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C', uz: '\u274C Bekor qilish' },
  ],
  CONFIRMED: [{ status: 'PREPARING', en: '\u{1F468}\u200D\u{1F373} \u0413\u043E\u0442\u043E\u0432\u0438\u0442\u044C', uz: '\u{1F468}\u200D\u{1F373} Tayyorlash' }],
  PREPARING: [{ status: 'READY', en: '\u{1F4E6} \u0413\u043E\u0442\u043E\u0432', uz: '\u{1F4E6} Tayyor' }],
  READY: [
    { status: 'SHIPPED', en: '\u{1F69A} \u041E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C', uz: "\u{1F69A} Jo'natish" },
    { status: 'DELIVERED', en: '\u{1F4EC} \u0414\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D', uz: '\u{1F4EC} Yetkazildi' },
  ],
  SHIPPED: [{ status: 'DELIVERED', en: '\u{1F4EC} \u0414\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D', uz: '\u{1F4EC} Yetkazildi' }],
  DELIVERED: [{ status: 'COMPLETED', en: '\u{1F389} \u0417\u0430\u0432\u0435\u0440\u0448\u0438\u0442\u044C', uz: '\u{1F389} Yakunlash' }],
};

function isUzLanguageCode(code?: string | null): boolean {
  return (code || '').toLowerCase().startsWith('uz');
}

function tLangByCode(code: string | null | undefined, en: string, uz: string): string {
  return isUzLanguageCode(code) ? uz : en;
}

function tCtx(ctx: any, en: string, uz: string): string {
  return tLangByCode(ctx?.from?.language_code, en, uz);
}

function statusLabel(status: OrderStatusType, langCode?: string | null): string {
  return isUzLanguageCode(langCode) ? STATUS_LABEL_UZ[status] : STATUS_LABEL_EN[status];
}
function buildStoreMiniAppUrl(miniAppUrl: string | null | undefined, storeId: string): string | null {
  if (!miniAppUrl) return null;
  try {
    const url = new URL(miniAppUrl);
    if (!url.searchParams.get('storeId')) {
      url.searchParams.set('storeId', storeId);
    }
    return url.toString();
  } catch {
    return miniAppUrl;
  }
}



async function isAdmin(tenantId: string, adminTelegramId: bigint): Promise<boolean> {
  const user = await prisma.user.findFirst({
    where: {
      tenantId,
      adminTelegramId,
      isActive: true,
      role: { in: ['OWNER', 'MANAGER'] },
    },
  });
  return !!user;
}

function buildAdminOrderKeyboard(orderId: string, currentStatus: OrderStatusType, langCode?: string | null) {
  const actions = NEXT_STATUS[currentStatus] || [];
  const kb = new InlineKeyboard();
  actions.forEach((a, idx) => {
    kb.text(tLangByCode(langCode, a.en, a.uz), `adm_${a.status}_${orderId}`);
    if ((idx + 1) % 2 === 0) kb.row();
  });
  return kb;
}

export async function registerBot(
  storeId: string,
  tenantId: string,
  encryptedToken: string,
  welcomeMessage: string,
  miniAppUrl?: string | null,
  prebuiltBot?: Bot
): Promise<void> {
  let bot: Bot;
  if (prebuiltBot) {
    bot = prebuiltBot;
  } else {
    const token = decrypt(encryptedToken);
    bot = new Bot(token);
    await bot.init();
  }
  const resolvedMiniAppUrl = buildStoreMiniAppUrl(miniAppUrl, storeId);

  // Skip setChatMenuButton when a prebuiltBot is supplied — the caller has
  // already set the menu button with the correct URL.
  if (!prebuiltBot && resolvedMiniAppUrl) {
    try {
      await bot.api.setChatMenuButton({
        menu_button: {
          type: 'web_app',
          text: '\u{1F6CD} Do\'kon',
          web_app: { url: resolvedMiniAppUrl },
        },
      });
    } catch {}
  }

  try {
    await bot.api.setMyCommands([
      { command: 'start', description: '\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043C\u0435\u043D\u044E' },
      { command: 'shop', description: '\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043C\u0430\u0433\u0430\u0437\u0438\u043D' },
      { command: 'help', description: '\u041F\u043E\u043C\u043E\u0449\u044C' },
      { command: 'orders', description: '\u041F\u043E\u0441\u043B\u0435\u0434\u043D\u0438\u0435 \u0437\u0430\u043A\u0430\u0437\u044B (\u0430\u0434\u043C\u0438\u043D)' },
      { command: 'stats', description: '\u0421\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043A\u0430 (\u0430\u0434\u043C\u0438\u043D)' },
      { command: 'admin', description: '\u041F\u0440\u0438\u0432\u044F\u0437\u043A\u0430 \u0430\u0434\u043C\u0438\u043D\u0430: /admin CODE' },
    ]);
  } catch {}

  bot.command('start', async (ctx) => {
    const inline = new InlineKeyboard();
    if (resolvedMiniAppUrl) inline.webApp(tCtx(ctx, '\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043C\u0430\u0433\u0430\u0437\u0438\u043D', "Do'konni ochish"), resolvedMiniAppUrl);

    const keyboard = new Keyboard();
    if (resolvedMiniAppUrl) keyboard.webApp(tCtx(ctx, '\u041C\u0430\u0433\u0430\u0437\u0438\u043D', "Do'kon"), resolvedMiniAppUrl).row();
    keyboard.text(tCtx(ctx, '\u041F\u043E\u043C\u043E\u0449\u044C', 'Yordam'));

    await ctx.reply(welcomeMessage || tCtx(ctx, '\u0414\u043E\u0431\u0440\u043E \u043F\u043E\u0436\u0430\u043B\u043E\u0432\u0430\u0442\u044C \u0432 SellGram!', "SellGram'ga xush kelibsiz!"), { reply_markup: inline });
    await ctx.reply(tCtx(ctx, '\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435:', 'Amalni tanlang:'), { reply_markup: keyboard.resized().persistent() });

    if (ctx.from) {
      await prisma.customer.upsert({
        where: { tenantId_telegramId: { tenantId, telegramId: BigInt(ctx.from.id) } },
        update: {
          telegramUser: ctx.from.username,
          firstName: ctx.from.first_name,
          lastName: ctx.from.last_name,
          languageCode: ctx.from.language_code,
        },
        create: {
          tenantId,
          telegramId: BigInt(ctx.from.id),
          telegramUser: ctx.from.username,
          firstName: ctx.from.first_name,
          lastName: ctx.from.last_name,
          languageCode: ctx.from.language_code,
        },
      });
    }
  });

  bot.command('shop', async (ctx) => {
    if (!resolvedMiniAppUrl) {
      await ctx.reply(tCtx(ctx, '\u0421\u0441\u044B\u043B\u043A\u0430 \u043D\u0430 \u043C\u0430\u0433\u0430\u0437\u0438\u043D \u0435\u0449\u0435 \u043D\u0435 \u043D\u0430\u0441\u0442\u0440\u043E\u0435\u043D\u0430.', "Do'kon havolasi hali sozlanmagan."));
      return;
    }
    const kb = new InlineKeyboard().webApp(tCtx(ctx, '\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043C\u0430\u0433\u0430\u0437\u0438\u043D', "Do'konni ochish"), resolvedMiniAppUrl);
    await ctx.reply(tCtx(ctx, '\u041E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u043C\u0430\u0433\u0430\u0437\u0438\u043D \u043A\u043D\u043E\u043F\u043A\u043E\u0439 \u043D\u0438\u0436\u0435:', "Quyidagi tugma orqali do'konni oching:"), { reply_markup: kb });
  });

  bot.command('admin', async (ctx) => {
    if (!ctx.from) return;
    const tgId = BigInt(ctx.from.id);

    const existing = await prisma.user.findFirst({ where: { tenantId, adminTelegramId: tgId } });
    if (existing) {
      await ctx.reply(tCtx(ctx, `\u0423\u0436\u0435 \u043F\u0440\u0438\u0432\u044F\u0437\u0430\u043D\u043E: ${existing.name} (${existing.role}).`, `${existing.name} (${existing.role}) allaqachon ulangan.`));
      return;
    }

    const code = ctx.message?.text?.trim().split(/\s+/)[1];
    if (!code) {
      await ctx.reply(tCtx(ctx, '\u041F\u043E\u043B\u0443\u0447\u0438\u0442\u0435 \u043A\u043E\u0434 \u0432 \u0430\u0434\u043C\u0438\u043D-\u043F\u0430\u043D\u0435\u043B\u0438 \u0438 \u043E\u0442\u043F\u0440\u0430\u0432\u044C\u0442\u0435: /admin 123456', "Admin paneldan kod olib yuboring: /admin 123456"));
      return;
    }

    const user = await prisma.user.findFirst({
      where: {
        tenantId,
        telegramLinkCode: code,
        telegramLinkCodeExpiresAt: { gt: new Date() },
        isActive: true,
      },
    });

    if (!user) {
      await ctx.reply(tCtx(ctx, '\u041A\u043E\u0434 \u043D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u0438\u043B\u0438 \u043F\u0440\u043E\u0441\u0440\u043E\u0447\u0435\u043D. \u0421\u0433\u0435\u043D\u0435\u0440\u0438\u0440\u0443\u0439\u0442\u0435 \u043D\u043E\u0432\u044B\u0439 \u043A\u043E\u0434 \u0432 \u0430\u0434\u043C\u0438\u043D-\u043F\u0430\u043D\u0435\u043B\u0438.', "Kod noto'g'ri yoki muddati tugagan. Admin panelda yangisini yarating."));
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        adminTelegramId: tgId,
        telegramLinkCode: null,
        telegramLinkCodeExpiresAt: null,
      },
    });

    await ctx.reply(
      tCtx(
        ctx,
        `Telegram \u043F\u0440\u0438\u0432\u044F\u0437\u0430\u043D.\n\n\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C: ${user.name} (${user.role})\nEmail: ${user.email}\n\n\u041A\u043E\u043C\u0430\u043D\u0434\u044B: /orders /stats /help`,
        `Telegram ulandi!\n\nFoydalanuvchi: ${user.name} (${user.role})\nEmail: ${user.email}\n\nBuyruqlar: /orders /stats /help`
      )
    );
  });

  bot.command('orders', async (ctx) => {
    if (!ctx.from) return;
    if (!(await isAdmin(tenantId, BigInt(ctx.from.id)))) {
      await ctx.reply(tCtx(ctx, '\u041D\u0443\u0436\u0435\u043D \u0434\u043E\u0441\u0442\u0443\u043F \u0430\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440\u0430. \u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u043E\u0442\u043F\u0440\u0430\u0432\u044C\u0442\u0435 /admin.', 'Admin ruxsati kerak. Avval /admin yuboring.'));
      return;
    }

    const orders = await prisma.order.findMany({
      where: { tenantId },
      include: { customer: { select: { firstName: true, telegramUser: true } }, items: true },
      orderBy: { createdAt: 'desc' },
      take: 7,
    });

    if (orders.length === 0) {
      await ctx.reply(tCtx(ctx, '\u041F\u043E\u043A\u0430 \u0437\u0430\u043A\u0430\u0437\u043E\u0432 \u043D\u0435\u0442.', "Hozircha buyurtmalar yo'q."));
      return;
    }

    const lines = orders.map((o: any) => {
      const customerName = o.customer.firstName || o.customer.telegramUser || '-';
      const items = o.items.map((i: any) => `${i.name} x${i.qty}`).join(', ');
      return `${STATUS_EMOJI[o.status as OrderStatusType]} #${o.orderNumber} - ${customerName}\n${items}\n${Number(o.total).toLocaleString()} UZS - ${statusLabel(o.status, ctx.from?.language_code)}`;
    });

    await ctx.reply(`${tCtx(ctx, '\u041F\u043E\u0441\u043B\u0435\u0434\u043D\u0438\u0435 \u0437\u0430\u043A\u0430\u0437\u044B', "So'nggi buyurtmalar")}:\n\n${lines.join('\n\n')}`);
  });

  bot.command('stats', async (ctx) => {
    if (!ctx.from) return;
    if (!(await isAdmin(tenantId, BigInt(ctx.from.id)))) {
      await ctx.reply(tCtx(ctx, '\u041D\u0443\u0436\u0435\u043D \u0434\u043E\u0441\u0442\u0443\u043F \u0430\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440\u0430. \u0421\u043D\u0430\u0447\u0430\u043B\u0430 \u043E\u0442\u043F\u0440\u0430\u0432\u044C\u0442\u0435 /admin.', 'Admin ruxsati kerak. Avval /admin yuboring.'));
      return;
    }

    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [todayOrders, weekOrders, todayRevenue, weekRevenue, newCustomers, pendingOrders] = await Promise.all([
      prisma.order.count({ where: { tenantId, createdAt: { gte: today } } }),
      prisma.order.count({ where: { tenantId, createdAt: { gte: weekAgo } } }),
      prisma.order.aggregate({ where: { tenantId, createdAt: { gte: today }, status: { not: 'CANCELLED' } }, _sum: { total: true } }),
      prisma.order.aggregate({ where: { tenantId, createdAt: { gte: weekAgo }, status: { not: 'CANCELLED' } }, _sum: { total: true } }),
      prisma.customer.count({ where: { tenantId, createdAt: { gte: today } } }),
      prisma.order.count({ where: { tenantId, status: { in: ['NEW', 'CONFIRMED', 'PREPARING'] } } }),
    ]);

    const message = tCtx(
      ctx,
      `\u0421\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043A\u0430\n\n\u0421\u0435\u0433\u043E\u0434\u043D\u044F:\n\u0417\u0430\u043A\u0430\u0437\u043E\u0432: ${todayOrders}\n\u0412\u044B\u0440\u0443\u0447\u043A\u0430: ${Number(todayRevenue._sum.total || 0).toLocaleString()} UZS\n\u041D\u043E\u0432\u044B\u0445 \u043A\u043B\u0438\u0435\u043D\u0442\u043E\u0432: ${newCustomers}\n\n\u0417\u0430 7 \u0434\u043D\u0435\u0439:\n\u0417\u0430\u043A\u0430\u0437\u043E\u0432: ${weekOrders}\n\u0412\u044B\u0440\u0443\u0447\u043A\u0430: ${Number(weekRevenue._sum.total || 0).toLocaleString()} UZS\n\n\u0412 \u0440\u0430\u0431\u043E\u0442\u0435: ${pendingOrders}`,
      `Statistika\n\nBugun:\nBuyurtmalar: ${todayOrders}\nTushum: ${Number(todayRevenue._sum.total || 0).toLocaleString()} UZS\nYangi mijozlar: ${newCustomers}\n\nHafta:\nBuyurtmalar: ${weekOrders}\nTushum: ${Number(weekRevenue._sum.total || 0).toLocaleString()} UZS\n\nJarayonda: ${pendingOrders}`
    );

    await ctx.reply(message);
  });

  bot.hears(['\u041F\u043E\u043C\u043E\u0449\u044C', 'Yordam'], async (ctx) => {
    await ctx.reply('/help');
  });

  bot.command('help', async (ctx) => {
    await ctx.reply(
      tCtx(
        ctx,
        '\u041A\u043E\u043C\u0430\u043D\u0434\u044B SellGram:\n/start - \u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043C\u0430\u0433\u0430\u0437\u0438\u043D\n/shop - \u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043C\u0430\u0433\u0430\u0437\u0438\u043D\n/admin <code> - \u041F\u0440\u0438\u0432\u044F\u0437\u0430\u0442\u044C Telegram\n/orders - \u041F\u043E\u0441\u043B\u0435\u0434\u043D\u0438\u0435 \u0437\u0430\u043A\u0430\u0437\u044B\n/stats - \u0421\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043A\u0430 \u0437\u0430 \u0434\u0435\u043D\u044C/\u043D\u0435\u0434\u0435\u043B\u044E\n/help - \u041F\u043E\u043C\u043E\u0449\u044C',
        "SellGram buyruqlari:\n/start - Do'konni ochish\n/shop - Do'konni ochish\n/admin <code> - Telegram ulash\n/orders - So'nggi buyurtmalar\n/stats - Kun/hafta statistikasi\n/help - Yordam"
      )
    );
  });

  bot.callbackQuery(/^adm_(.+)_(.+)$/, async (ctx) => {
    const match = ctx.callbackQuery.data.match(/^adm_(.+?)_(.+)$/);
    if (!match || !ctx.from) return;

    const [, rawStatus, orderId] = match;
    const newStatus = rawStatus as OrderStatusType;

    if (!(await isAdmin(tenantId, BigInt(ctx.from.id)))) {
      await ctx.answerCallbackQuery({ text: tCtx(ctx, '\u041D\u0435\u0442 \u0434\u043E\u0441\u0442\u0443\u043F\u0430', "Ruxsat yo'q") });
      return;
    }

    const order = await prisma.order.findFirst({
      where: { id: orderId, tenantId },
      include: { items: true, customer: true },
    });
    if (!order) {
      await ctx.answerCallbackQuery({ text: tCtx(ctx, '\u0417\u0430\u043A\u0430\u0437 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D', 'Buyurtma topilmadi') });
      return;
    }

    const allowed = NEXT_STATUS[order.status as OrderStatusType]?.map((s: any) => s.status as OrderStatusType) || [];
    if (!allowed.includes(newStatus)) {
      await ctx.answerCallbackQuery({ text: tCtx(ctx, '\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 \u043F\u0435\u0440\u0435\u0445\u043E\u0434 \u0441\u0442\u0430\u0442\u0443\u0441\u0430', "Noto'g'ri status o'tishi") });
      return;
    }

    const updateData: any = { status: newStatus };
    if (newStatus === 'SHIPPED') updateData.trackingNumber = order.trackingNumber || `TRK-${Date.now()}`;
    if (newStatus === 'CANCELLED') updateData.cancelReason = '\u041E\u0442\u043C\u0435\u043D\u0435\u043D\u043E \u0430\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440\u043E\u043C';

    // Wrap stock check + decrement + status update in a single transaction so concurrent
    // admin clicks cannot both decrement stock or double-confirm the order.
    let txError: string | null = null;
    await prisma.$transaction(async (tx: any) => {
      // Re-check current status inside the transaction to guard against double-confirm.
      const fresh = await tx.order.findUnique({ where: { id: order.id }, select: { status: true } });
      if (!fresh || fresh.status !== order.status) {
        txError = 'STALE';
        throw new Error('STALE');
      }

      if (newStatus === 'CONFIRMED' || newStatus === 'PREPARING') {
        for (const item of order.items) {
          const product = await tx.product.findUnique({ where: { id: item.productId } });
          if (!product || product.stockQty < item.qty) {
            txError = `STOCK:${item.name}`;
            throw new Error(txError);
          }
        }
      }

      if (newStatus === 'CONFIRMED') {
        for (const item of order.items) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stockQty: { decrement: item.qty } },
          });
        }
      }

      await tx.order.update({ where: { id: order.id }, data: updateData });
    });

    // TypeScript doesn't track mutations inside async callbacks, so we cast to
    // re-inform the type checker that txError may have been set inside the transaction.
    const txErrMsg = txError as string | null;
    if (txErrMsg) {
      if (txErrMsg === 'STALE') {
        await ctx.answerCallbackQuery({ text: tCtx(ctx, '\u0423\u0436\u0435 \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u0430\u043D\u043E', 'Allaqachon qayta ishlangan') });
        return;
      }
      if (txErrMsg.startsWith('STOCK:')) {
        const itemName = txErrMsg.slice(6);
        await ctx.answerCallbackQuery({ text: tCtx(ctx, `\u041D\u0435\u0434\u043E\u0441\u0442\u0430\u0442\u043E\u0447\u043D\u043E \u043E\u0441\u0442\u0430\u0442\u043A\u0430: ${itemName}`, `${itemName} uchun qoldiq yetarli emas`) });
        return;
      }
      await ctx.answerCallbackQuery({ text: tCtx(ctx, '\u041E\u0448\u0438\u0431\u043A\u0430', 'Xato') });
      return;
    }

    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    if (updated) {
      const kb = buildAdminOrderKeyboard(order.id, updated.status, ctx.from.language_code);
      const baseText = (ctx.callbackQuery.message?.text || '')
        .split('\n\nStatus:')[0]
        .split('\n\n\u0421\u0442\u0430\u0442\u0443\u0441:')[0]
        .split('\n\nHolat:')[0];
      const statusTitle = tCtx(ctx, '\u0421\u0442\u0430\u0442\u0443\u0441', 'Holat');
      const statusLine = `\n\n${statusTitle}: ${STATUS_EMOJI[updated.status as OrderStatusType]} ${statusLabel(updated.status, ctx.from.language_code)}`;
      await ctx.editMessageText(baseText + statusLine, {
        reply_markup: kb.inline_keyboard.length ? kb : undefined,
      }).catch(() => {});
    }

    await notifyOrderStatus(storeId, order.id, newStatus);
    await ctx.answerCallbackQuery({ text: tCtx(ctx, '\u041E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u043E', 'Yangilandi') });
  });

  bot.callbackQuery(/^confirm_received_(.+)$/, async (ctx) => {
    const match = ctx.callbackQuery.data.match(/^confirm_received_(.+)$/);
    if (!match || !ctx.from) return;

    const orderId = match[1];
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.status !== 'DELIVERED') {
      await ctx.answerCallbackQuery({ text: tCtx(ctx, '\u0417\u0430\u043A\u0430\u0437 \u0443\u0436\u0435 \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u0430\u043D', 'Buyurtma allaqachon qayta ishlangan') });
      return;
    }

    await completeDeliveredOrder(order.id, storeId);

    await ctx.editMessageText((ctx.callbackQuery.message?.text || '') + `\n\n${tCtx(ctx, '\u0421\u043F\u0430\u0441\u0438\u0431\u043E. \u0417\u0430\u043A\u0430\u0437 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D.', 'Rahmat. Buyurtma yakunlandi.')}`).catch(() => {});
    await ctx.answerCallbackQuery({ text: tCtx(ctx, '\u0411\u0430\u043B\u043B\u044B \u043D\u0430\u0447\u0438\u0441\u043B\u0435\u043D\u044B', "Ball qo'shildi") });
  });

  bot.catch((err) => {
    console.error(`[Bot:${storeId}]`, err.error);
  });

  if (bots.has(storeId)) {
    console.warn(`[BotManager] Re-registering bot for store ${storeId} — replacing existing instance`);
  }
  bots.set(storeId, { bot, storeId, tenantId });
}

async function completeDeliveredOrder(orderId: string, storeId: string): Promise<void> {
  // Atomic status guard: only the call that transitions DELIVERED→COMPLETED actually wins.
  // Concurrent calls (timer + customer button) both arrive here, but only one gets count=1.
  const transitioned = await prisma.order.updateMany({
    where: { id: orderId, status: 'DELIVERED' },
    data: { status: 'COMPLETED', paymentStatus: 'PAID' },
  });
  if (transitioned.count === 0) return; // already processed

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { store: true },
  });
  if (!order) return;

  await awardLoyaltyPoints(order.id);

  const customer = await prisma.customer.findUnique({ where: { id: order.customerId } });
  const bot = bots.get(storeId)?.bot;
  if (customer?.telegramId && bot) {
    try {
      const completionText = tLangByCode(
        customer.languageCode,
        `\u0417\u0430\u043A\u0430\u0437 #${order.orderNumber} \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D. \u0411\u0430\u043B\u043B\u044B \u043D\u0430\u0447\u0438\u0441\u043B\u0435\u043D\u044B.`,
        `#${order.orderNumber} buyurtma yakunlandi. Ballar qo'shildi.`
      );
      await bot.api.sendMessage(customer.telegramId.toString(), completionText);
    } catch {}
  }
}

async function autoCompleteDelivered(): Promise<void> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const delivered = await prisma.order.findMany({
    where: { status: 'DELIVERED', updatedAt: { lt: cutoff } },
    select: { id: true, storeId: true },
  });

  for (const o of delivered) {
    await completeDeliveredOrder(o.id, o.storeId);
  }
}

function toStartOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function calcDaysLeft(planExpiresAt: Date, now = new Date()): number {
  const msInDay = 24 * 60 * 60 * 1000;
  const from = toStartOfDay(now).getTime();
  const to = toStartOfDay(planExpiresAt).getTime();
  return Math.round((to - from) / msInDay);
}

function getBotInstanceForTenant(tenantId: string): BotInstance | null {
  for (const instance of bots.values()) {
    if (instance.tenantId === tenantId) return instance;
  }
  return null;
}

async function remindExpiringSubscriptions(): Promise<void> {
  const now = new Date();
  const reminder = await getSystemSubscriptionReminderSettings();
  if (!reminder.enabled || reminder.days.length === 0) return;
  const reminderDays = reminder.days;

  const maxReminderDay = Math.max(...reminderDays);
  const until = new Date(now.getTime() + maxReminderDay * 24 * 60 * 60 * 1000);

  const expiringTenants = await prisma.tenant.findMany({
    where: {
      plan: { in: ['PRO', 'BUSINESS'] },
      planExpiresAt: {
        not: null,
        gte: toStartOfDay(now),
        lte: toStartOfDay(until),
      },
    },
    select: { id: true, name: true, plan: true, planExpiresAt: true },
  });

  if (expiringTenants.length === 0) return;

  const redis = getRedis();

  for (const tenant of expiringTenants) {
    if (!tenant.planExpiresAt) continue;

    const daysLeft = calcDaysLeft(tenant.planExpiresAt, now);
    if (!reminderDays.includes(daysLeft)) continue;

    const instance = getBotInstanceForTenant(tenant.id);
    if (!instance) continue;

    const dedupeKey = `subscription:reminder:${tenant.id}:${daysLeft}:${toStartOfDay(now).toISOString().slice(0, 10)}`;
    const dedupeSet = await redis.set(dedupeKey, '1', 'EX', 26 * 60 * 60, 'NX');
    if (!dedupeSet) continue;

    const admins = await prisma.user.findMany({
      where: {
        tenantId: tenant.id,
        role: { in: ['OWNER', 'MANAGER'] },
        adminTelegramId: { not: null },
        isActive: true,
      },
      select: { adminTelegramId: true },
    });

    if (admins.length === 0) continue;

    for (const admin of admins) {
      if (!admin.adminTelegramId) continue;

      const renewHint = tLangByCode(
        undefined,
        '\u041F\u0440\u043E\u0434\u043B\u0438\u0442\u0435 \u0442\u0430\u0440\u0438\u0444 \u0432 \u043F\u0430\u043D\u0435\u043B\u0438: \u0422\u0430\u0440\u0438\u0444\u044B -> \u0412\u044B\u0431\u0440\u0430\u0442\u044C \u0442\u0430\u0440\u0438\u0444 -> \u041E\u043F\u043B\u0430\u0442\u0430.',
        "Tarifni panelda uzaytiring: Tariflar -> Tarifni tanlash -> To'lov."
      );

      const text = tLangByCode(
        undefined,
        `\u26A0\uFE0F \u0422\u0430\u0440\u0438\u0444 ${tenant.plan} \u0434\u043B\u044F \u043C\u0430\u0433\u0430\u0437\u0438\u043D\u0430 "${tenant.name}" \u0438\u0441\u0442\u0435\u043A\u0430\u0435\u0442 \u0447\u0435\u0440\u0435\u0437 ${daysLeft} \u0434\u043D.\n\u0414\u0430\u0442\u0430 \u043E\u043A\u043E\u043D\u0447\u0430\u043D\u0438\u044F: ${tenant.planExpiresAt.toLocaleDateString('ru-RU')}\n\n${renewHint}`,
        `\u26A0\uFE0F "${tenant.name}" do'koni uchun ${tenant.plan} tarifi ${daysLeft} kundan so'ng tugaydi.\nTugash sanasi: ${tenant.planExpiresAt.toLocaleDateString('uz-UZ')}\n\n${renewHint}`
      );

      try {
        await instance.bot.api.sendMessage(admin.adminTelegramId.toString(), text);
      } catch {}
    }
  }
}

async function awardLoyaltyPoints(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { customer: true },
  });
  if (!order || !order.customer) return;

  const cfg = await prisma.loyaltyConfig.findUnique({ where: { tenantId: order.tenantId } });
  if (!cfg?.isEnabled) return;

  const pointsEarned = Math.floor(Number(order.total) / cfg.unitAmount) * cfg.pointsPerUnit;
  if (pointsEarned <= 0) return;

  const customer = await prisma.customer.update({
    where: { id: order.customerId },
    data: { loyaltyPoints: { increment: pointsEarned } },
  });

  await prisma.loyaltyTransaction.create({
    data: {
      customerId: order.customerId,
      tenantId: order.tenantId,
      type: 'EARN',
      points: pointsEarned,
      balanceAfter: customer.loyaltyPoints,
      orderId,
      description: `\u041D\u0430\u0447\u0438\u0441\u043B\u0435\u043D\u044B \u0431\u0430\u043B\u043B\u044B \u0437\u0430 \u0437\u0430\u043A\u0430\u0437 #${order.orderNumber}`,
    },
  });
}

export async function initBotManager(fastify: FastifyInstance): Promise<void> {
  const stores = await prisma.store.findMany({ where: { isActive: true }, include: { tenant: true } });

  for (const store of stores) {
    try {
      await registerBot(store.id, store.tenantId, store.botToken, store.welcomeMessage ?? '', store.miniAppUrl);
      fastify.log.info(`Bot registered for store ${store.name} (${store.id})`);
    } catch (err) {
      fastify.log.error(`Failed to register bot for store ${store.name}: ${err}`);
    }
  }

  setInterval(() => void autoCompleteDelivered(), 30 * 60 * 1000);
  setTimeout(() => void autoCompleteDelivered(), 10_000);

  setInterval(() => void remindExpiringSubscriptions(), 60 * 60 * 1000);
  setTimeout(() => void remindExpiringSubscriptions(), 30_000);
}

async function retryTelegramSend(fn: () => Promise<unknown>, maxAttempts = 3): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await fn();
      return;
    } catch (err: any) {
      const code: number | undefined = err?.error_code;
      // 400 Bad Request (invalid chat id) and 403 Forbidden (bot blocked) are permanent — don't retry
      if (code === 400 || code === 403) return;
      if (attempt === maxAttempts) return;
      await new Promise((r) => setTimeout(r, attempt * 1000));
    }
  }
}

export async function notifyOrderStatus(storeId: string, orderId: string, newStatus: OrderStatusType): Promise<void> {
  const instance = bots.get(storeId);
  if (!instance) return;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { customer: true },
  });
  if (!order?.customer?.telegramId) return;

  const lang = order.customer.languageCode;
  const textByStatus: Partial<Record<OrderStatusType, string>> = {
    CONFIRMED: tLangByCode(lang, `\u2705 \u0417\u0430\u043A\u0430\u0437 #${order.orderNumber} \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D.`, `\u2705 #${order.orderNumber} buyurtma tasdiqlandi.`),
    PREPARING: tLangByCode(lang, `\u{1F468}\u200D\u{1F373} \u0417\u0430\u043A\u0430\u0437 #${order.orderNumber} \u0433\u043E\u0442\u043E\u0432\u0438\u0442\u0441\u044F.`, `\u{1F468}\u200D\u{1F373} #${order.orderNumber} buyurtma tayyorlanmoqda.`),
    READY: tLangByCode(lang, `\u{1F4E6} \u0417\u0430\u043A\u0430\u0437 #${order.orderNumber} \u0433\u043E\u0442\u043E\u0432.`, `\u{1F4E6} #${order.orderNumber} buyurtma tayyor.`),
    SHIPPED: tLangByCode(lang, `\u{1F69A} \u0417\u0430\u043A\u0430\u0437 #${order.orderNumber} \u0432 \u043F\u0443\u0442\u0438.`, `\u{1F69A} #${order.orderNumber} buyurtma yo'lda.`),
    CANCELLED: tLangByCode(lang, `\u274C \u0417\u0430\u043A\u0430\u0437 #${order.orderNumber} \u043E\u0442\u043C\u0435\u043D\u0435\u043D.`, `\u274C #${order.orderNumber} buyurtma bekor qilindi.`),
    REFUNDED: tLangByCode(lang, `\u{1F4B8} \u0412\u043E\u0437\u0432\u0440\u0430\u0442 \u043F\u043E \u0437\u0430\u043A\u0430\u0437\u0443 #${order.orderNumber} \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D.`, `\u{1F4B8} #${order.orderNumber} buyurtma uchun qaytarish bajarildi.`),
  };

  if (newStatus === 'DELIVERED') {
    const kb = new InlineKeyboard().text(
      tLangByCode(lang, '\u2705 \u042F \u043F\u043E\u043B\u0443\u0447\u0438\u043B \u0437\u0430\u043A\u0430\u0437', '\u2705 Buyurtmani oldim'),
      `confirm_received_${orderId}`
    );

    const deliveredText = tLangByCode(
      lang,
      `\u{1F4EC} \u0417\u0430\u043A\u0430\u0437 #${order.orderNumber} \u0434\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D.\n\n\u0418\u0442\u043E\u0433\u043E: ${Number(order.total).toLocaleString()} UZS\n\n\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u0435 \u043F\u043E\u043B\u0443\u0447\u0435\u043D\u0438\u0435.`,
      `\u{1F4EC} #${order.orderNumber} buyurtma yetkazildi.\n\nJami: ${Number(order.total).toLocaleString()} UZS\n\nQabulni tasdiqlang.`
    );

    await retryTelegramSend(() =>
      instance.bot.api.sendMessage(order.customer!.telegramId!.toString(), deliveredText, { reply_markup: kb })
    );
    return;
  }

  const text = textByStatus[newStatus];
  if (!text) return;
  await retryTelegramSend(() =>
    instance.bot.api.sendMessage(order.customer!.telegramId!.toString(), text)
  );
}

export async function notifyPaymentPaid(storeId: string, orderId: string): Promise<void> {
  const instance = bots.get(storeId);
  if (!instance) return;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { customer: true },
  });
  if (!order?.customer?.telegramId) return;

  const lang = order.customer.languageCode;
  const text = tLangByCode(
    lang,
    `\u{1F4B3} \u041E\u043F\u043B\u0430\u0442\u0430 \u043F\u043E \u0437\u0430\u043A\u0430\u0437\u0443 #${order.orderNumber} \u043F\u0440\u0438\u043D\u044F\u0442\u0430. \u0416\u0434\u0438\u0442\u0435 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u044F.`,
    `\u{1F4B3} #${order.orderNumber} buyurtma to'lovi qabul qilindi. Tasdiqlanishini kuting.`
  );

  await retryTelegramSend(() =>
    instance.bot.api.sendMessage(order.customer!.telegramId!.toString(), text)
  );
}

export async function notifyNewOrder(storeId: string, order: any): Promise<void> {
  const instance = bots.get(storeId);
  if (!instance) return;

  const admins = await prisma.user.findMany({
    where: {
      tenantId: instance.tenantId,
      role: { in: ['OWNER', 'MANAGER'] },
      adminTelegramId: { not: null },
      isActive: true,
    },
    select: { adminTelegramId: true },
  });

  if (admins.length === 0) return;

  const customer = await prisma.customer.findUnique({ where: { id: order.customerId } });
  const name = customer
    ? `${customer.firstName || ''}${customer.lastName ? ` ${customer.lastName}` : ''}`.trim() || `@${customer.telegramUser}` || '\u041A\u043B\u0438\u0435\u043D\u0442'
    : '\u041A\u043B\u0438\u0435\u043D\u0442';
  const phone = customer?.phone;

  const items = order.items || [];
  const itemsList = items.map((i: any) => `\u2022 ${i.name} x${i.qty} - ${Number(i.total).toLocaleString()} UZS`).join('\n');

  for (const admin of admins) {
    if (!admin.adminTelegramId) continue;
    const lang = undefined;

    const text = tLangByCode(
      lang,
      `\u{1F195} \u041D\u043E\u0432\u044B\u0439 \u0437\u0430\u043A\u0430\u0437 #${order.orderNumber}\n\n\u{1F464} ${name}${phone ? `\n\u{1F4DE} ${phone}` : ''}\n\n\u{1F6D2} \u0422\u043E\u0432\u0430\u0440\u044B:\n${itemsList}\n\n\u{1F4B0} \u0418\u0442\u043E\u0433\u043E: ${Number(order.total).toLocaleString()} UZS`,
      `\u{1F195} Yangi buyurtma #${order.orderNumber}\n\n\u{1F464} ${name}${phone ? `\n\u{1F4DE} ${phone}` : ''}\n\n\u{1F6D2} Mahsulotlar:\n${itemsList}\n\n\u{1F4B0} Jami: ${Number(order.total).toLocaleString()} UZS`
    );

    const kb = new InlineKeyboard()
      .text(tLangByCode(lang, '\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C', 'Tasdiqlash'), `adm_CONFIRMED_${order.id}`)
      .text(tLangByCode(lang, '\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C', 'Bekor qilish'), `adm_CANCELLED_${order.id}`);

    await retryTelegramSend(() =>
      instance.bot.api.sendMessage(admin.adminTelegramId!.toString(), text, { reply_markup: kb })
    );
  }
}

export async function sendPromoBroadcast(
  storeId: string,
  recipients: Array<{ telegramId: bigint; language?: string | null; firstName?: string | null }>,
  payload: { title?: string; message: string }
): Promise<{ sent: number; failed: number }> {
  const instance = bots.get(storeId);
  if (!instance) return { sent: 0, failed: recipients.length };

  let sent = 0;
  let failed = 0;

  for (const recipient of recipients) {
    const header = payload.title ? `*${payload.title}*\n\n` : '';
    const footer = tLangByCode(recipient.language, '\n\n- SellGram', '\n\n- SellGram');

    try {
      await instance.bot.api.sendMessage(recipient.telegramId.toString(), `${header}${payload.message}${footer}`, { parse_mode: 'Markdown' });
      sent += 1;
    } catch {
      failed += 1;
    }
  }

  return { sent, failed };
}

export function isBotRegistered(storeId: string): boolean {
  return bots.has(storeId);
}

export function getBotWebhookHandler(storeId: string) {
  const instance = bots.get(storeId);
  if (!instance) return null;
  return webhookCallback(instance.bot, 'fastify');
}

export function getBot(storeId: string): Bot | undefined {
  return bots.get(storeId)?.bot;
}






