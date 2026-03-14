import { Bot, webhookCallback, InlineKeyboard, Keyboard } from 'grammy';
import type { FastifyInstance } from 'fastify';
import type { OrderStatusType } from '@sellgram/shared';
import prisma from '../lib/prisma.js';
import { decrypt } from '../lib/encrypt.js';

interface BotInstance {
  bot: Bot;
  storeId: string;
  tenantId: string;
}

const bots = new Map<string, BotInstance>();

const STATUS_EMOJI: Record<OrderStatusType, string> = {
  NEW: 'NEW',
  CONFIRMED: 'CONF',
  PREPARING: 'PREP',
  READY: 'READY',
  SHIPPED: 'SHIP',
  DELIVERED: 'DONE',
  COMPLETED: 'COMP',
  CANCELLED: 'CANC',
  REFUNDED: 'REF',
};

const STATUS_LABEL_EN: Record<OrderStatusType, string> = {
  NEW: 'New',
  CONFIRMED: 'Confirmed',
  PREPARING: 'Preparing',
  READY: 'Ready',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  REFUNDED: 'Refunded',
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
    { status: 'CONFIRMED', en: 'Подтвердить', uz: '? Tasdiqlash' },
    { status: 'CANCELLED', en: 'Отменить', uz: '? Bekor qilish' },
  ],
  CONFIRMED: [{ status: 'PREPARING', en: '????? Prepare', uz: '????? Tayyorlash' }],
  PREPARING: [{ status: 'READY', en: '?? Ready', uz: '?? Tayyor' }],
  READY: [
    { status: 'SHIPPED', en: '?? Ship', uz: "?? Jo'natish" },
    { status: 'DELIVERED', en: '?? Delivered', uz: '?? Yetkazildi' },
  ],
  SHIPPED: [{ status: 'DELIVERED', en: '?? Delivered', uz: '?? Yetkazildi' }],
  DELIVERED: [{ status: 'COMPLETED', en: '?? Complete', uz: '?? Yakunlash' }],
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

async function registerBot(
  storeId: string,
  tenantId: string,
  encryptedToken: string,
  welcomeMessage: string,
  miniAppUrl?: string | null
): Promise<void> {
  const token = decrypt(encryptedToken);
  const bot = new Bot(token);
  await bot.init();
  const resolvedMiniAppUrl = buildStoreMiniAppUrl(miniAppUrl, storeId);

  if (resolvedMiniAppUrl) {
    try {
      await bot.api.setChatMenuButton({
        menu_button: {
          type: 'web_app',
          text: 'Shop',
          web_app: { url: resolvedMiniAppUrl },
        },
      });
    } catch {}
  }

  try {
    await bot.api.setMyCommands([
      { command: 'start', description: 'Открыть меню' },
      { command: 'shop', description: 'Открыть магазин' },
      { command: 'help', description: 'Помощь' },
      { command: 'orders', description: 'Последние заказы (админ)' },
      { command: 'stats', description: 'Статистика (админ)' },
      { command: 'admin', description: 'Link admin: /admin CODE' },
    ]);
  } catch {}

  bot.command('start', async (ctx) => {
    const inline = new InlineKeyboard();
    if (resolvedMiniAppUrl) inline.webApp(tCtx(ctx, 'Открыть магазин', "Do'konni ochish"), resolvedMiniAppUrl);

    const keyboard = new Keyboard();
    if (resolvedMiniAppUrl) keyboard.webApp(tCtx(ctx, 'Shop', "Do'kon"), resolvedMiniAppUrl).row();
    keyboard.text('/help');

    await ctx.reply(welcomeMessage || tCtx(ctx, 'Welcome!', "Xush kelibsiz!"), { reply_markup: inline });
    await ctx.reply(tCtx(ctx, 'Choose action:', 'Amalni tanlang:'), { reply_markup: keyboard.resized().persistent() });

    if (ctx.from) {
      await prisma.customer.upsert({
        where: { tenantId_telegramId: { tenantId, telegramId: BigInt(ctx.from.id) } },
        update: {
          telegramUser: ctx.from.username,
          firstName: ctx.from.first_name,
          lastName: ctx.from.last_name,
        },
        create: {
          tenantId,
          telegramId: BigInt(ctx.from.id),
          telegramUser: ctx.from.username,
          firstName: ctx.from.first_name,
          lastName: ctx.from.last_name,
        },
      });
    }
  });

  bot.command('shop', async (ctx) => {
    if (!resolvedMiniAppUrl) {
      await ctx.reply(tCtx(ctx, 'Ссылка на магазин еще не настроена.', "Do'kon havolasi hali sozlanmagan."));
      return;
    }
    const kb = new InlineKeyboard().webApp(tCtx(ctx, 'Открыть магазин', "Do'konni ochish"), resolvedMiniAppUrl);
    await ctx.reply(tCtx(ctx, 'Откройте магазин кнопкой ниже:', "Quyidagi tugma orqali do'konni oching:"), { reply_markup: kb });
  });

  bot.command('admin', async (ctx) => {
    if (!ctx.from) return;
    const tgId = BigInt(ctx.from.id);

    const existing = await prisma.user.findFirst({ where: { tenantId, adminTelegramId: tgId } });
    if (existing) {
      await ctx.reply(tCtx(ctx, `Already linked: ${existing.name} (${existing.role}).`, `${existing.name} (${existing.role}) allaqachon ulangan.`));
      return;
    }

    const code = ctx.message?.text?.trim().split(/\s+/)[1];
    if (!code) {
      await ctx.reply(tCtx(ctx, 'Получите код в админ-панели и отправьте: /admin 123456', "Admin paneldan kod olib yuboring: /admin 123456"));
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
      await ctx.reply(tCtx(ctx, 'Код неверный или просрочен. Сгенерируйте новый код в админ-панели.', "Kod noto'g'ri yoki muddati tugagan. Admin panelda yangisini yarating."));
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
        `Telegram linked!\n\nUser: ${user.name} (${user.role})\nEmail: ${user.email}\n\nCommands: /orders /stats /help`,
        `Telegram ulandi!\n\nFoydalanuvchi: ${user.name} (${user.role})\nEmail: ${user.email}\n\nBuyruqlar: /orders /stats /help`
      )
    );
  });

  bot.command('orders', async (ctx) => {
    if (!ctx.from) return;
    if (!(await isAdmin(tenantId, BigInt(ctx.from.id)))) {
      await ctx.reply(tCtx(ctx, 'Admin access required. Use /admin first.', 'Admin ruxsati kerak. Avval /admin yuboring.'));
      return;
    }

    const orders = await prisma.order.findMany({
      where: { tenantId },
      include: { customer: { select: { firstName: true, telegramUser: true } }, items: true },
      orderBy: { createdAt: 'desc' },
      take: 7,
    });

    if (orders.length === 0) {
      await ctx.reply(tCtx(ctx, 'Пока заказов нет.', "Hozircha buyurtmalar yo'q."));
      return;
    }

    const lines = orders.map((o: any) => {
      const customerName = o.customer.firstName || o.customer.telegramUser || '-';
      const items = o.items.map((i: any) => `${i.name} x${i.qty}`).join(', ');
      return `${STATUS_EMOJI[o.status as OrderStatusType]} #${o.orderNumber} - ${customerName}\n${items}\n${Number(o.total).toLocaleString()} UZS · ${statusLabel(o.status, ctx.from?.language_code)}`;
    });

    await ctx.reply(`${tCtx(ctx, 'Последние заказы', "So'nggi buyurtmalar")}:\n\n${lines.join('\n\n')}`);
  });

  bot.command('stats', async (ctx) => {
    if (!ctx.from) return;
    if (!(await isAdmin(tenantId, BigInt(ctx.from.id)))) {
      await ctx.reply(tCtx(ctx, 'Admin access required. Use /admin first.', 'Admin ruxsati kerak. Avval /admin yuboring.'));
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
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
      `Stats\n\nToday:\nOrders: ${todayOrders}\nRevenue: ${Number(todayRevenue._sum.total || 0).toLocaleString()} UZS\nNew customers: ${newCustomers}\n\nWeek:\nOrders: ${weekOrders}\nRevenue: ${Number(weekRevenue._sum.total || 0).toLocaleString()} UZS\n\nIn progress: ${pendingOrders}`,
      `Statistika\n\nBugun:\nBuyurtmalar: ${todayOrders}\nTushum: ${Number(todayRevenue._sum.total || 0).toLocaleString()} UZS\nYangi mijozlar: ${newCustomers}\n\nHafta:\nBuyurtmalar: ${weekOrders}\nTushum: ${Number(weekRevenue._sum.total || 0).toLocaleString()} UZS\n\nJarayonda: ${pendingOrders}`
    );

    await ctx.reply(message);
  });

  bot.command('help', async (ctx) => {
    await ctx.reply(
      tCtx(
        ctx,
        'Команды SellGram:\n/start - Открыть магазин\n/shop - Открыть магазин\n/admin <code> - Привязать Telegram\n/orders - Последние заказы\n/stats - Статистика за день/неделю\n/help - Помощь',
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
      await ctx.answerCallbackQuery({ text: tCtx(ctx, 'Нет доступа', "Ruxsat yo'q") });
      return;
    }

    const order = await prisma.order.findFirst({
      where: { id: orderId, tenantId },
      include: { items: true, customer: true },
    });
    if (!order) {
      await ctx.answerCallbackQuery({ text: tCtx(ctx, 'Заказ не найден', 'Buyurtma topilmadi') });
      return;
    }

    const allowed = NEXT_STATUS[order.status as OrderStatusType]?.map((s: any) => s.status as OrderStatusType) || [];
    if (!allowed.includes(newStatus)) {
      await ctx.answerCallbackQuery({ text: tCtx(ctx, 'Некорректный переход статуса', "Noto'g'ri status o'tishi") });
      return;
    }

    if (newStatus === 'CONFIRMED' || newStatus === 'PREPARING') {
      for (const item of order.items) {
        const product = await prisma.product.findUnique({ where: { id: item.productId } });
        if (!product || product.stockQty < item.qty) {
          await ctx.answerCallbackQuery({ text: tCtx(ctx, `Not enough stock: ${item.name}`, `${item.name} uchun qoldiq yetarli emas`) });
          return;
        }
      }
    }

    if (newStatus === 'CONFIRMED') {
      for (const item of order.items) {
        await prisma.product.update({
          where: { id: item.productId },
          data: { stockQty: { decrement: item.qty } },
        });
      }
    }

    const updateData: any = { status: newStatus };
    if (newStatus === 'SHIPPED') updateData.trackingNumber = order.trackingNumber || `TRK-${Date.now()}`;
    if (newStatus === 'CANCELLED') updateData.cancelReason = 'Отменено администратором';

    await prisma.order.update({ where: { id: order.id }, data: updateData });

    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    if (updated) {
      const kb = buildAdminOrderKeyboard(order.id, updated.status, ctx.from.language_code);
      const baseText = (ctx.callbackQuery.message?.text || '').split('\n\nStatus:')[0];
      const statusLine = `\n\nStatus: ${STATUS_EMOJI[updated.status as OrderStatusType]} ${statusLabel(updated.status, ctx.from.language_code)}`;
      await ctx.editMessageText(baseText + statusLine, {
        reply_markup: kb.inline_keyboard.length ? kb : undefined,
      }).catch(() => {});
    }

    await notifyOrderStatus(storeId, order.id, newStatus);
    await ctx.answerCallbackQuery({ text: tCtx(ctx, 'Обновлено', 'Yangilandi') });
  });

  bot.callbackQuery(/^confirm_received_(.+)$/, async (ctx) => {
    const match = ctx.callbackQuery.data.match(/^confirm_received_(.+)$/);
    if (!match || !ctx.from) return;

    const orderId = match[1];
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.status !== 'DELIVERED') {
      await ctx.answerCallbackQuery({ text: tCtx(ctx, 'Заказ уже обработан', 'Buyurtma allaqachon qayta ishlangan') });
      return;
    }

    await completeDeliveredOrder(order.id, storeId);

    await ctx.editMessageText((ctx.callbackQuery.message?.text || '') + '\n\nСпасибо. Заказ завершен.').catch(() => {});
    await ctx.answerCallbackQuery({ text: tCtx(ctx, 'Баллы начислены', "Ball qo'shildi") });
  });

  bot.catch((err) => {
    console.error(`[Bot:${storeId}]`, err.error);
  });

  bots.set(storeId, { bot, storeId, tenantId });
}

async function completeDeliveredOrder(orderId: string, storeId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { store: true },
  });
  if (!order || order.status !== 'DELIVERED') return;

  await prisma.order.update({ where: { id: order.id }, data: { status: 'COMPLETED' } });
  await awardLoyaltyPoints(order.id);

  const customer = await prisma.customer.findUnique({ where: { id: order.customerId } });
  const bot = bots.get(storeId)?.bot;
  if (customer?.telegramId && bot) {
    try {
      await bot.api.sendMessage(customer.telegramId.toString(), `Order #${order.orderNumber} completed. Баллы начислены.`);
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
      description: `Начислены баллы за заказ #${order.orderNumber}`,
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
}

export async function notifyOrderStatus(storeId: string, orderId: string, newStatus: OrderStatusType): Promise<void> {
  const instance = bots.get(storeId);
  if (!instance) return;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { customer: true },
  });
  if (!order?.customer?.telegramId) return;

  const lang = order.customer.language;
  const textByStatus: Partial<Record<OrderStatusType, string>> = {
    CONFIRMED: tLangByCode(lang, `? Заказ #${order.orderNumber} подтвержден.`, `? #${order.orderNumber} buyurtma tasdiqlandi.`),
    PREPARING: tLangByCode(lang, `????? Заказ #${order.orderNumber} готовится.`, `????? #${order.orderNumber} buyurtma tayyorlanmoqda.`),
    READY: tLangByCode(lang, `?? Заказ #${order.orderNumber} готов.`, `?? #${order.orderNumber} buyurtma tayyor.`),
    SHIPPED: tLangByCode(lang, `?? Заказ #${order.orderNumber} в пути.`, `?? #${order.orderNumber} buyurtma yo'lda.`),
    CANCELLED: tLangByCode(lang, `? Заказ #${order.orderNumber} отменен.`, `? #${order.orderNumber} buyurtma bekor qilindi.`),
    REFUNDED: tLangByCode(lang, `?? Возврат по заказу #${order.orderNumber} выполнен.`, `?? #${order.orderNumber} buyurtma uchun qaytarish bajarildi.`),
  };

  if (newStatus === 'DELIVERED') {
    const kb = new InlineKeyboard().text(
      tLangByCode(lang, '? Я получил заказ', '? Buyurtmani oldim'),
      `confirm_received_${orderId}`
    );

    const deliveredText = tLangByCode(
      lang,
      `?? Заказ #${order.orderNumber} доставлен.\n\nИтого: ${Number(order.total).toLocaleString()} UZS\n\nПодтвердите получение.`,
      `?? #${order.orderNumber} buyurtma yetkazildi.\n\nJami: ${Number(order.total).toLocaleString()} UZS\n\nQabulni tasdiqlang.`
    );

    await instance.bot.api.sendMessage(order.customer.telegramId.toString(), deliveredText, { reply_markup: kb });
    return;
  }

  const text = textByStatus[newStatus];
  if (!text) return;
  await instance.bot.api.sendMessage(order.customer.telegramId.toString(), text);
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
    select: { adminTelegramId: true, language: true },
  });

  if (admins.length === 0) return;

  const customer = await prisma.customer.findUnique({ where: { id: order.customerId } });
  const name = customer
    ? `${customer.firstName || ''}${customer.lastName ? ` ${customer.lastName}` : ''}`.trim() || `@${customer.telegramUser}` || 'Клиент'
    : 'Клиент';
  const phone = customer?.phone;

  const items = order.items || [];
  const itemsList = items.map((i: any) => `• ${i.name} x${i.qty} - ${Number(i.total).toLocaleString()} UZS`).join('\n');

  for (const admin of admins) {
    if (!admin.adminTelegramId) continue;
    const lang = admin.language;

    const text = tLangByCode(
      lang,
      `?? Новый заказ #${order.orderNumber}\n\n?? ${name}${phone ? `\n?? ${phone}` : ''}\n\n?? Товары:\n${itemsList}\n\n?? Итого: ${Number(order.total).toLocaleString()} UZS`,
      `?? Yangi buyurtma #${order.orderNumber}\n\n?? ${name}${phone ? `\n?? ${phone}` : ''}\n\n?? Mahsulotlar:\n${itemsList}\n\n?? Jami: ${Number(order.total).toLocaleString()} UZS`
    );

    const kb = new InlineKeyboard()
      .text(tLangByCode(lang, 'Подтвердить', 'Tasdiqlash'), `adm_CONFIRMED_${order.id}`)
      .text(tLangByCode(lang, 'Отменить', 'Bekor qilish'), `adm_CANCELLED_${order.id}`);

    try {
      await instance.bot.api.sendMessage(admin.adminTelegramId.toString(), text, { reply_markup: kb });
    } catch {}
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

export function getBotWebhookHandler(storeId: string) {
  const instance = bots.get(storeId);
  if (!instance) return null;
  return webhookCallback(instance.bot, 'fastify');
}

export function getBot(storeId: string): Bot | undefined {
  return bots.get(storeId)?.bot;
}




