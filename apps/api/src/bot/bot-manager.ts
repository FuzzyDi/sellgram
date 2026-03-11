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

const STATUS_EMOJI: Record<string, string> = {
  NEW: '🆕', CONFIRMED: '✅', PREPARING: '👨‍🍳', READY: '📦',
  SHIPPED: '🚚', DELIVERED: '📬', COMPLETED: '🎉', CANCELLED: '❌', REFUNDED: '↩️',
};
const STATUS_LABEL: Record<string, string> = {
  NEW: 'Новый', CONFIRMED: 'Подтверждён', PREPARING: 'Собирается', READY: 'Готов',
  SHIPPED: 'Отправлен', DELIVERED: 'Доставлен', COMPLETED: 'Завершён', CANCELLED: 'Отменён', REFUNDED: 'Возврат',
};
const DELIVERY_LABEL: Record<string, string> = { PICKUP: 'Самовывоз', LOCAL: 'Доставка', NATIONAL: 'По стране' };

// Next status map for admin flow
const NEXT_STATUS: Partial<Record<OrderStatusType, { status: OrderStatusType; label: string }[]>> = {
  NEW:       [{ status: 'CONFIRMED', label: '✅ Подтвердить' }, { status: 'CANCELLED', label: '❌ Отклонить' }],
  CONFIRMED: [{ status: 'PREPARING', label: '👨‍🍳 Собирать' }],
  PREPARING: [{ status: 'READY', label: '📦 Готов' }],
  READY:     [{ status: 'SHIPPED', label: '🚚 Отправить' }, { status: 'DELIVERED', label: '📬 Выдан' }],
  SHIPPED:   [{ status: 'DELIVERED', label: '📬 Доставлен' }],
  DELIVERED: [{ status: 'COMPLETED', label: '🎉 Завершить' }],
};

// ═══════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════

export async function initBotManager(fastify: FastifyInstance): Promise<void> {
  const stores = await prisma.store.findMany({
    where: { isActive: true },
    include: { tenant: true },
  });

  for (const store of stores) {
    try {
      await registerBot(store.id, store.tenantId, store.botToken, store.welcomeMessage ?? '', store.miniAppUrl);
      fastify.log.info(`Bot registered for store ${store.name} (${store.id})`);
    } catch (err) {
      fastify.log.error(`Failed to register bot for store ${store.name}: ${err}`);
    }
  }

  // Auto-complete job
  setInterval(() => autoCompleteDelivered(), 30 * 60 * 1000);
  setTimeout(() => autoCompleteDelivered(), 10_000);
}

// ═══════════════════════════════════════════════════════════
// REGISTER BOT
// ═══════════════════════════════════════════════════════════

async function registerBot(
  storeId: string, tenantId: string, encryptedToken: string,
  welcomeMessage: string, miniAppUrl?: string | null
): Promise<void> {
  const token = decrypt(encryptedToken);
  const bot = new Bot(token);
  await bot.init();

  // Telegram chat menu button (bottom-left button in chat)
  if (miniAppUrl) {
    try {
      await bot.api.setChatMenuButton({
        menu_button: {
          type: 'web_app',
          text: 'Магазин',
          web_app: { url: miniAppUrl },
        },
      });
    } catch {
      // Non-critical: bot can still work with /start button
    }
  }

  // Bot command menu
  try {
    await bot.api.setMyCommands([
      { command: 'start', description: 'Открыть меню' },
      { command: 'shop', description: 'Открыть магазин' },
      { command: 'help', description: 'Справка' },
      { command: 'orders', description: 'Последние заказы (админ)' },
      { command: 'stats', description: 'Статистика (админ)' },
      { command: 'admin', description: 'Привязка админа: /admin CODE' },
    ]);
  } catch {
    // Ignore menu command setup errors
  }

  // ── /start — customer entry point ──────────────────────
  bot.command('start', async (ctx) => {
    const inlineKeyboard = new InlineKeyboard();
    if (miniAppUrl) inlineKeyboard.webApp('🛍️ Открыть магазин', miniAppUrl);

    const replyKeyboard = new Keyboard();
    if (miniAppUrl) replyKeyboard.webApp('🛍️ Магазин', miniAppUrl).row();
    replyKeyboard.text('/help');

    await ctx.reply(welcomeMessage || 'Добро пожаловать! 🛍️', { reply_markup: inlineKeyboard });
    await ctx.reply('Выберите действие:', {
      reply_markup: replyKeyboard.resized().persistent(),
    });

    // Upsert customer
    if (ctx.from) {
      await prisma.customer.upsert({
        where: { tenantId_telegramId: { tenantId, telegramId: BigInt(ctx.from.id) } },
        update: { telegramUser: ctx.from.username, firstName: ctx.from.first_name, lastName: ctx.from.last_name },
        create: { tenantId, telegramId: BigInt(ctx.from.id), telegramUser: ctx.from.username, firstName: ctx.from.first_name, lastName: ctx.from.last_name },
      });
    }
  });

  // ── /shop — quick open web app ──────────────────────────
  bot.command('shop', async (ctx) => {
    if (!miniAppUrl) {
      await ctx.reply('Ссылка на магазин пока не настроена.');
      return;
    }

    const keyboard = new InlineKeyboard().webApp('🛍️ Открыть магазин', miniAppUrl);
    await ctx.reply('Откройте магазин по кнопке ниже:', { reply_markup: keyboard });
  });

  // ── /admin <code> — secure Telegram linking ──────────────────────────────
  bot.command('admin', async (ctx) => {
    if (!ctx.from) return;
    const tgId = BigInt(ctx.from.id);

    const existingUser = await prisma.user.findFirst({
      where: { tenantId, adminTelegramId: tgId },
    });
    if (existingUser) {
      await ctx.reply(`✅ Уже привязано: ${existingUser.name} (${existingUser.role}).`);
      return;
    }

    const parts = ctx.message?.text?.trim().split(/\s+/) ?? [];
    const code = parts[1];
    if (!code) {
      await ctx.reply('🔐 Для привязки сначала получите код в админке и отправьте: /admin 123456');
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
      await ctx.reply('❌ Код недействителен или истек. Сгенерируйте новый в админ-панели.');
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
      `🎉 Telegram привязан!\n\n` +
      `👤 ${user.name} (${user.role})\n` +
      `📧 ${user.email}\n\n` +
      `Команды: /orders /stats /help`
    );
  });

  // ── /orders — show recent orders ───────────────────────
  bot.command('orders', async (ctx) => {
    if (!ctx.from) return;
    if (!(await isAdmin(tenantId, BigInt(ctx.from.id)))) {
      await ctx.reply('⚠️ Вы не администратор. Отправьте /admin для привязки.');
      return;
    }

    const orders = await prisma.order.findMany({
      where: { tenantId },
      include: { customer: { select: { firstName: true, telegramUser: true } }, items: true },
      orderBy: { createdAt: 'desc' },
      take: 7,
    });

    if (orders.length === 0) {
      await ctx.reply('📦 Заказов пока нет.');
      return;
    }

    const lines = orders.map(o => {
      const name = o.customer.firstName || o.customer.telegramUser || '—';
      const items = o.items.map(i => `${i.name}×${i.qty}`).join(', ');
      return `${STATUS_EMOJI[o.status]} #${o.orderNumber} — ${name}\n   ${items}\n   💰 ${Number(o.total).toLocaleString()} сум · ${STATUS_LABEL[o.status]}`;
    });

    await ctx.reply(`📋 Последние заказы:\n\n${lines.join('\n\n')}`);
  });

  // ── /stats — daily statistics ──────────────────────────
  bot.command('stats', async (ctx) => {
    if (!ctx.from) return;
    if (!(await isAdmin(tenantId, BigInt(ctx.from.id)))) {
      await ctx.reply('⚠️ Отправьте /admin для привязки.');
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

    const text = `📊 Статистика\n\n` +
      `📅 Сегодня:\n` +
      `  📦 Заказов: ${todayOrders}\n` +
      `  💰 Выручка: ${Number(todayRevenue._sum.total || 0).toLocaleString()} сум\n` +
      `  👤 Новых клиентов: ${newCustomers}\n\n` +
      `📆 За неделю:\n` +
      `  📦 Заказов: ${weekOrders}\n` +
      `  💰 Выручка: ${Number(weekRevenue._sum.total || 0).toLocaleString()} сум\n\n` +
      `⏳ В обработке: ${pendingOrders}`;

    await ctx.reply(text);
  });

  // ── /help ──────────────────────────────────────────────
  bot.command('help', async (ctx) => {
    await ctx.reply(
      `🛒 SellGram — команды:\n\n` +
      `👤 Для покупателей:\n` +
      `/start — Открыть магазин\n\n` +
      `👔 Для администратора:\n` +
      `/admin <code> — Привязать Telegram\n` +
      `/orders — Последние заказы\n` +
      `/stats — Статистика за день/неделю\n` +
      `/help — Эта справка\n\n` +
      `💡 Управляйте заказами прямо через кнопки в уведомлениях.`
    );
  });

  // ── Admin: status change callbacks ─────────────────────
  bot.callbackQuery(/^adm_(.+)_(.+)$/, async (ctx) => {
    const match = ctx.callbackQuery.data.match(/^adm_(.+?)_(.+)$/);
    if (!match) return;

    const [, rawStatus, orderId] = match;
    const newStatus = rawStatus as OrderStatusType;
    if (!ctx.from) return;

    // Verify admin
    if (!(await isAdmin(tenantId, BigInt(ctx.from.id)))) {
      await ctx.answerCallbackQuery({ text: 'Нет доступа' });
      return;
    }

    const order = await prisma.order.findFirst({
      where: { id: orderId, tenantId },
      include: { items: true, customer: true },
    });
    if (!order) { await ctx.answerCallbackQuery({ text: 'Заказ не найден' }); return; }

    // Validate transition
    const allowed = NEXT_STATUS[order.status]?.map(s => s.status) || [];
    if (!allowed.includes(newStatus)) {
      await ctx.answerCallbackQuery({ text: `Нельзя: ${STATUS_LABEL[order.status]} → ${STATUS_LABEL[newStatus]}` });
      return;
    }

    // Stock decrement on CONFIRMED
    if (newStatus === 'CONFIRMED') {
      for (const item of order.items) {
        const target = item.variantId
          ? await prisma.productVariant.findUnique({ where: { id: item.variantId } })
          : await prisma.product.findUnique({ where: { id: item.productId } });
        if (target && target.stockQty < item.qty) {
          await ctx.answerCallbackQuery({ text: `Недостаточно "${item.name}" на складе` });
          return;
        }
        if (item.variantId) {
          await prisma.productVariant.update({ where: { id: item.variantId }, data: { stockQty: { decrement: item.qty } } });
        } else {
          await prisma.product.update({ where: { id: item.productId }, data: { stockQty: { decrement: item.qty } } });
        }
      }
    }

    // Stock restore on CANCELLED
    if (newStatus === 'CANCELLED' && ['CONFIRMED', 'PREPARING', 'READY'].includes(order.status)) {
      for (const item of order.items) {
        if (item.variantId) {
          await prisma.productVariant.update({ where: { id: item.variantId }, data: { stockQty: { increment: item.qty } } });
        } else {
          await prisma.product.update({ where: { id: item.productId }, data: { stockQty: { increment: item.qty } } });
        }
      }
      if (order.loyaltyPointsUsed > 0) {
        await prisma.customer.update({ where: { id: order.customerId }, data: { loyaltyPoints: { increment: order.loyaltyPointsUsed } } });
      }
    }

    // Complete order logic
    if (newStatus === 'COMPLETED') {
      await completeOrder(orderId, tenantId, `tg-admin-${ctx.from.id}`);
    } else {
      // Update status
      const updateData: any = { status: newStatus };
      if (newStatus === 'CANCELLED') updateData.cancelReason = 'Отклонён администратором';
      await prisma.order.update({ where: { id: orderId }, data: updateData });
      await prisma.orderStatusLog.create({
        data: { orderId, fromStatus: order.status, toStatus: newStatus, changedBy: `tg-admin-${ctx.from.id}` },
      });
    }

    // Update message with new status + next action buttons
    const updatedOrder = await prisma.order.findUnique({ where: { id: orderId } });
    const nextActions = NEXT_STATUS[newStatus] || [];

    let newText = (ctx.callbackQuery.message?.text || '').split('\n\n📌')[0]; // Remove old status line
    newText += `\n\n📌 ${STATUS_EMOJI[newStatus]} ${STATUS_LABEL[newStatus]}`;

    const keyboard = nextActions.length > 0
      ? new InlineKeyboard().row(...nextActions.map(a => InlineKeyboard.text(a.label, `adm_${a.status}_${orderId}`)))
      : undefined;

    try {
      await ctx.editMessageText(newText, { reply_markup: keyboard });
    } catch { /* message may be too old */ }

    await ctx.answerCallbackQuery({ text: `${STATUS_EMOJI[newStatus]} ${STATUS_LABEL[newStatus]}` });

    // Notify customer
    notifyOrderStatus(storeId, orderId, newStatus).catch(() => {});
  });

  // ── Customer: confirm delivery ─────────────────────────
  bot.callbackQuery(/^confirm_received_(.+)$/, async (ctx) => {
    const match = ctx.callbackQuery.data.match(/^confirm_received_(.+)$/);
    if (!match) return;
    const orderId = match[1];

    const order = await prisma.order.findFirst({ where: { id: orderId, tenantId } });
    if (!order || order.status !== 'DELIVERED') {
      await ctx.answerCallbackQuery({ text: 'Заказ уже завершён' });
      return;
    }

    await completeOrder(orderId, tenantId, 'customer-confirmed');

    try {
      await ctx.editMessageText(
        (ctx.callbackQuery.message?.text || '') + '\n\n🎉 Спасибо! Заказ завершён.',
        { reply_markup: undefined }
      );
    } catch {}
    await ctx.answerCallbackQuery({ text: '🎉 Баллы начислены!' });
  });

  // Error handler
  bot.catch((err) => console.error(`Bot error [${storeId}]:`, err));

  bots.set(storeId, { bot, storeId, tenantId });
}

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

async function isAdmin(tenantId: string, telegramId: bigint): Promise<boolean> {
  const user = await prisma.user.findFirst({
    where: { tenantId, adminTelegramId: telegramId, isActive: true },
  });
  return !!user;
}

async function getAdminTelegramIds(tenantId: string): Promise<bigint[]> {
  const users = await prisma.user.findMany({
    where: { tenantId, adminTelegramId: { not: null }, isActive: true },
    select: { adminTelegramId: true },
  });
  return users.map(u => u.adminTelegramId!);
}

// ═══════════════════════════════════════════════════════════
// COMPLETE ORDER (loyalty + status)
// ═══════════════════════════════════════════════════════════

async function completeOrder(orderId: string, tenantId: string, changedBy: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { customer: true } });
  if (!order || order.status !== 'DELIVERED') return;

  const loyaltyConfig = await prisma.loyaltyConfig.findUnique({ where: { tenantId } });
  if (loyaltyConfig?.isEnabled) {
    const pointsEarned = Math.floor(Number(order.total) / loyaltyConfig.unitAmount) * loyaltyConfig.pointsPerUnit;
    if (pointsEarned > 0) {
      const customer = await prisma.customer.update({
        where: { id: order.customerId },
        data: { loyaltyPoints: { increment: pointsEarned }, totalSpent: { increment: order.total }, ordersCount: { increment: 1 } },
      });
      await prisma.loyaltyTransaction.create({
        data: { customerId: order.customerId, tenantId, type: 'EARN', points: pointsEarned, balanceAfter: customer.loyaltyPoints, orderId, description: `Начисление за заказ #${order.orderNumber}` },
      });
    }
  }

  await prisma.order.update({ where: { id: orderId }, data: { status: 'COMPLETED', paymentStatus: 'PAID' } });
  await prisma.orderStatusLog.create({ data: { orderId, fromStatus: 'DELIVERED', toStatus: 'COMPLETED', changedBy } });
}

// ═══════════════════════════════════════════════════════════
// AUTO-COMPLETE (24h)
// ═══════════════════════════════════════════════════════════

async function autoCompleteDelivered() {
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const orders = await prisma.order.findMany({
      where: { status: 'DELIVERED', updatedAt: { lt: cutoff } },
      include: { store: true },
    });
    for (const order of orders) {
      try {
        await completeOrder(order.id, order.tenantId, 'auto-24h');
        const instance = bots.get(order.storeId);
        const customer = await prisma.customer.findUnique({ where: { id: order.customerId } });
        if (instance && customer) {
          try { await instance.bot.api.sendMessage(customer.telegramId.toString(), `🎉 Заказ #${order.orderNumber} автоматически завершён. Баллы начислены!`); } catch {}
        }
      } catch (err) { console.error(`[AUTO-COMPLETE] Failed ${order.id}:`, err); }
    }
    if (orders.length) console.log(`[AUTO-COMPLETE] Completed ${orders.length} orders`);
  } catch (err) { console.error('[AUTO-COMPLETE] Job failed:', err); }
}

// ═══════════════════════════════════════════════════════════
// NOTIFY CUSTOMER — status change
// ═══════════════════════════════════════════════════════════

export async function notifyOrderStatus(storeId: string, orderId: string, newStatus: OrderStatusType): Promise<void> {
  const instance = bots.get(storeId);
  if (!instance) return;

  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { customer: true, items: true } });
  if (!order) return;

  const messages: Record<string, string> = {
    CONFIRMED: `✅ Ваш заказ #${order.orderNumber} подтверждён!\n\nМы начали обработку.`,
    PREPARING: `👨‍🍳 Заказ #${order.orderNumber} собирается!`,
    READY: `📦 Заказ #${order.orderNumber} готов!\n\n${order.deliveryType === 'PICKUP' ? 'Заберите в магазине.' : 'Передаём курьеру.'}`,
    SHIPPED: `🚚 Заказ #${order.orderNumber} в пути!${order.trackingNumber ? `\n\nТрек: ${order.trackingNumber}` : ''}`,
    CANCELLED: `❌ Заказ #${order.orderNumber} отменён.${order.cancelReason ? `\nПричина: ${order.cancelReason}` : ''}`,
    REFUNDED: `↩️ Возврат по заказу #${order.orderNumber} оформлен.`,
  };

  try {
    if (newStatus === 'DELIVERED') {
      const kb = new InlineKeyboard().text('✅ Получил заказ', `confirm_received_${orderId}`);
      await instance.bot.api.sendMessage(order.customer.telegramId.toString(),
        `📬 Заказ #${order.orderNumber} доставлен!\n\n💰 Итого: ${Number(order.total).toLocaleString()} сум\n\nПодтвердите получение для начисления баллов.`,
        { reply_markup: kb });
    } else if (messages[newStatus]) {
      await instance.bot.api.sendMessage(order.customer.telegramId.toString(), messages[newStatus]);
    }
  } catch { /* blocked */ }
}

// ═══════════════════════════════════════════════════════════
// NOTIFY ADMIN — new order (called from checkout)
// ═══════════════════════════════════════════════════════════

export async function notifyNewOrder(storeId: string, order: any): Promise<void> {
  const instance = bots.get(storeId);
  if (!instance) return;

  const adminIds = await getAdminTelegramIds(instance.tenantId);
  if (adminIds.length === 0) return;

  const customer = await prisma.customer.findUnique({ where: { id: order.customerId } });
  const name = customer
    ? `${customer.firstName || ''}${customer.lastName ? ' ' + customer.lastName : ''}`.trim() || `@${customer.telegramUser}` || 'Покупатель'
    : 'Покупатель';
  const phone = (order as any).contactPhone || customer?.phone || '';

  const itemsList = order.items
    .map((i: any) => `  • ${i.name} ×${i.qty} — ${Number(i.total).toLocaleString()} сум`)
    .join('\n');

  const text =
    `📦 Новый заказ #${order.orderNumber}\n\n` +
    `👤 ${name}${phone ? `\n📱 ${phone}` : ''}\n\n` +
    `📋 Товары:\n${itemsList}\n\n` +
    `${order.deliveryType !== 'PICKUP' ? `🚚 ${DELIVERY_LABEL[order.deliveryType] || order.deliveryType}` : '🏪 Самовывоз'}` +
    `${order.deliveryAddress ? `\n📍 ${order.deliveryAddress}` : ''}` +
    `${Number(order.deliveryPrice) > 0 ? `\n🚚 Доставка: ${Number(order.deliveryPrice).toLocaleString()} сум` : ''}` +
    `\n\n💰 Итого: ${Number(order.total).toLocaleString()} сум`;

  const keyboard = new InlineKeyboard()
    .text('✅ Подтвердить', `adm_CONFIRMED_${order.id}`)
    .text('❌ Отклонить', `adm_CANCELLED_${order.id}`);

  for (const adminId of adminIds) {
    try {
      await instance.bot.api.sendMessage(adminId.toString(), text, { reply_markup: keyboard });
    } catch { /* admin may have blocked bot */ }
  }
}

export async function sendPromoBroadcast(
  storeId: string,
  message: string,
  customerIds?: string[]
): Promise<Array<{ customerId: string; telegramId: bigint; success: boolean; error?: string }>> {
  const instance = bots.get(storeId);
  if (!instance) return [];

  const where: any = customerIds?.length
    ? { id: { in: customerIds }, tenantId: instance.tenantId }
    : { tenantId: instance.tenantId };

  const customers = await prisma.customer.findMany({
    where,
    select: { id: true, telegramId: true },
  });

  const results: Array<{ customerId: string; telegramId: bigint; success: boolean; error?: string }> = [];
  for (const customer of customers) {
    try {
      await instance.bot.api.sendMessage(customer.telegramId.toString(), message);
      results.push({ customerId: customer.id, telegramId: customer.telegramId, success: true });
    } catch (err: any) {
      results.push({
        customerId: customer.id,
        telegramId: customer.telegramId,
        success: false,
        error: err?.description || err?.message || 'send failed',
      });
    }
  }

  return results;
}

// ═══════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════

export function getBotWebhookHandler(storeId: string) {
  const instance = bots.get(storeId);
  if (!instance) return null;
  return webhookCallback(instance.bot, 'fastify');
}

export function getBot(storeId: string): Bot | undefined {
  return bots.get(storeId)?.bot;
}
