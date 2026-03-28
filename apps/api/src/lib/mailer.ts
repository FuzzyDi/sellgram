import { Resend } from 'resend';
import { getConfig } from '../config/index.js';

let resend: Resend | null = null;

function getResend(): Resend | null {
  if (resend) return resend;
  const { RESEND_API_KEY } = getConfig();
  if (!RESEND_API_KEY) return null;
  resend = new Resend(RESEND_API_KEY);
  return resend;
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  const client = getResend();
  if (!client) return false;
  try {
    const { EMAIL_FROM } = getConfig();
    await client.emails.send({ from: EMAIL_FROM, to: opts.to, subject: opts.subject, html: opts.html });
    return true;
  } catch (err: any) {
    console.error('[mailer] send failed:', err?.message);
    return false;
  }
}

// ─── Shared layout ────────────────────────────────────────────────────────────

function layout(content: string): string {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>SellGram</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <!-- Logo -->
        <tr><td style="padding-bottom:20px;text-align:center;">
          <span style="font-size:26px;font-weight:900;color:#0f172a;letter-spacing:-0.5px;">
            Sell<span style="color:#059669;">Gram</span>
          </span>
        </td></tr>
        <!-- Card -->
        <tr><td style="background:#fff;border-radius:16px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
          ${content}
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:20px 0;text-align:center;font-size:12px;color:#94a3b8;">
          © ${new Date().getFullYear()} SellGram · <a href="https://sellgram.uz" style="color:#94a3b8;">sellgram.uz</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function heading(text: string): string {
  return `<h1 style="margin:0 0 8px;font-size:22px;font-weight:800;color:#0f172a;line-height:1.2;">${text}</h1>`;
}

function para(text: string, muted = false): string {
  return `<p style="margin:12px 0;font-size:15px;line-height:1.6;color:${muted ? '#64748b' : '#1e293b'};">${text}</p>`;
}

function btn(text: string, href: string): string {
  return `<div style="margin:24px 0 8px;">
    <a href="${href}" style="display:inline-block;background:#059669;color:#fff;font-weight:700;font-size:15px;text-decoration:none;padding:12px 28px;border-radius:10px;">${text}</a>
  </div>`;
}

function divider(): string {
  return `<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />`;
}

function kv(label: string, value: string): string {
  return `<tr>
    <td style="padding:6px 0;font-size:13px;color:#64748b;width:160px;">${label}</td>
    <td style="padding:6px 0;font-size:13px;font-weight:700;color:#0f172a;">${value}</td>
  </tr>`;
}

function kvTable(rows: [string, string][]): string {
  return `<table cellpadding="0" cellspacing="0" style="width:100%;margin:12px 0;">${rows.map(([l, v]) => kv(l, v)).join('')}</table>`;
}

function bilingual(ru: string, uz: string): string {
  return `${ru}<br/><span style="color:#94a3b8;font-size:13px;">${uz}</span>`;
}

// ─── Templates ────────────────────────────────────────────────────────────────

export function tplWelcome(opts: { name: string; tenantName: string; adminUrl: string }): { subject: string; html: string } {
  return {
    subject: `Добро пожаловать в SellGram, ${opts.name}!`,
    html: layout(`
      ${heading(bilingual(`🎉 Добро пожаловать, ${opts.name}!`, `Xush kelibsiz, ${opts.name}!`))}
      ${para(bilingual(
        `Ваш магазин <strong>${opts.tenantName}</strong> успешно создан. Теперь вы можете добавить товары, настроить бота и принимать первые заказы.`,
        `<strong>${opts.tenantName}</strong> do'koningiz muvaffaqiyatli yaratildi. Endi mahsulotlar qo'shing, botni sozlang va birinchi buyurtmalarni qabul qiling.`,
      ))}
      ${btn('Открыть панель управления / Boshqaruv paneliga kirish', opts.adminUrl)}
      ${divider()}
      ${para(bilingual('Если у вас возникнут вопросы — мы всегда готовы помочь.', 'Savollaringiz bo\'lsa — biz doim yordam berishga tayyormiz.'), true)}
    `),
  };
}

export function tplInvoiceConfirmed(opts: {
  name: string;
  plan: string;
  amount: number;
  expiresAt: Date;
  adminUrl: string;
}): { subject: string; html: string } {
  const planLabel = opts.plan === 'BUSINESS' ? 'Business' : opts.plan === 'PRO' ? 'Pro' : 'Free';
  const expires = opts.expiresAt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  return {
    subject: `Оплата подтверждена — план ${planLabel} активирован`,
    html: layout(`
      <div style="text-align:center;font-size:40px;margin-bottom:8px;">✅</div>
      ${heading(bilingual('Оплата подтверждена!', 'To\'lov tasdiqlandi!'))}
      ${para(bilingual(
        `Здравствуйте, <strong>${opts.name}</strong>! Ваш платёж получен и обработан.`,
        `Salom, <strong>${opts.name}</strong>! To'lovingiz qabul qilindi va qayta ishlandi.`,
      ))}
      ${kvTable([
        [bilingual('Тариф / Tarif'), `<span style="color:#059669;font-weight:800;">${planLabel}</span>`],
        [bilingual('Сумма / Summa'), `${(opts.amount / 1000).toFixed(0)} 000 UZS`],
        [bilingual('Активен до / Amal qilish muddati'), expires],
      ])}
      ${btn('Перейти в панель / Panelga o\'tish', opts.adminUrl)}
    `),
  };
}

export function tplInvoiceRejected(opts: {
  name: string;
  amount: number;
  billingEmail: string;
}): { subject: string; html: string } {
  return {
    subject: 'Платёж отклонён — требуется действие',
    html: layout(`
      <div style="text-align:center;font-size:40px;margin-bottom:8px;">❌</div>
      ${heading(bilingual('Платёж отклонён', 'To\'lov rad etildi'))}
      ${para(bilingual(
        `Здравствуйте, <strong>${opts.name}</strong>! К сожалению, ваш платёж на сумму <strong>${(opts.amount / 1000).toFixed(0)} 000 UZS</strong> не был принят.`,
        `Salom, <strong>${opts.name}</strong>! Afsuski, <strong>${(opts.amount / 1000).toFixed(0)} 000 UZS</strong> miqdoridagi to'lovingiz qabul qilinmadi.`,
      ))}
      ${para(bilingual(
        `Если вы уже совершили оплату, пожалуйста, свяжитесь с нами и приложите скриншот платежа.`,
        `Agar to'lovni amalga oshirgan bo'lsangiz, iltimos, biz bilan bog\'laning va to'lov skrinshotini yuboring.`,
      ))}
      ${btn(`Написать в поддержку / Qo'llab-quvvatlashga yozish`, `mailto:${opts.billingEmail}`)}
    `),
  };
}

export function tplPlanExpiring(opts: {
  name: string;
  plan: string;
  daysLeft: number;
  expiresAt: Date;
  adminUrl: string;
}): { subject: string; html: string } {
  const planLabel = opts.plan === 'BUSINESS' ? 'Business' : 'Pro';
  const expires = opts.expiresAt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  const urgent = opts.daysLeft <= 3;
  return {
    subject: `⚠️ Подписка ${planLabel} истекает через ${opts.daysLeft} ${opts.daysLeft === 1 ? 'день' : 'дней'}`,
    html: layout(`
      <div style="text-align:center;font-size:40px;margin-bottom:8px;">${urgent ? '🔴' : '⚠️'}</div>
      ${heading(bilingual(
        `Подписка истекает через ${opts.daysLeft} ${opts.daysLeft === 1 ? 'день' : 'дней'}`,
        `Obuna ${opts.daysLeft} kundan keyin tugaydi`,
      ))}
      ${para(bilingual(
        `Здравствуйте, <strong>${opts.name}</strong>! Ваш план <strong>${planLabel}</strong> активен до <strong>${expires}</strong>.`,
        `Salom, <strong>${opts.name}</strong>! <strong>${planLabel}</strong> tarifingiz <strong>${expires}</strong> gacha amal qiladi.`,
      ))}
      ${para(bilingual(
        'После истечения подписки магазин перейдёт на план Free с ограничениями по товарам и заказам.',
        'Obuna tugagandan so\'ng do\'kon Free tarifiga o\'tadi va mahsulot hamda buyurtmalarga cheklovlar qo\'llaniladi.',
      ), true)}
      ${btn('Продлить подписку / Obunani yangilash', `${opts.adminUrl}/#/billing`)}
    `),
  };
}

export function tplPasswordReset(opts: { code: string }): { subject: string; html: string } {
  return {
    subject: 'Сброс пароля SellGram',
    html: layout(`
      <div style="text-align:center;font-size:40px;margin-bottom:8px;">🔐</div>
      ${heading(bilingual('Сброс пароля', 'Parolni tiklash'))}
      ${para(bilingual(
        'Вы запросили сброс пароля. Введите код ниже в форму на странице входа.',
        'Siz parolni tiklashni so\'radingiz. Quyidagi kodni kirish sahifasidagi formaga kiriting.',
      ))}
      <div style="text-align:center;margin:28px 0;">
        <span style="font-size:36px;font-weight:900;letter-spacing:8px;color:#059669;font-family:monospace;">${opts.code}</span>
      </div>
      ${para(bilingual('Код действителен 15 минут.', 'Kod 15 daqiqa davomida amal qiladi.'), true)}
      ${para(bilingual('Если вы не запрашивали сброс — проигнорируйте это письмо.', 'Agar siz tiklashni so\'ramagan bo\'lsangiz — ushbu xatni e\'tiborsiz qoldiring.'), true)}
    `),
  };
}
