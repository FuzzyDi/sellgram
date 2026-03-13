export const PROVIDERS = ['CASH', 'MANUAL_TRANSFER', 'TELEGRAM', 'CLICK', 'PAYME', 'UZUM', 'STRIPE', 'CUSTOM'] as const;
export type ProviderCode = typeof PROVIDERS[number];

export type FormState = {
  provider: ProviderCode;
  code: string;
  title: string;
  description: string;
  instructions: string;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
  customMetaJson: string;
  tgProviderToken: string;
  tgCurrency: string;
  clickServiceId: string;
  clickMerchantId: string;
  clickSecret: string;
  clickWebhookSecret: string;
  paymeMerchantId: string;
  paymeAuthKey: string;
  paymeWebhookSecret: string;
};

export const PROVIDER_HINTS: Record<ProviderCode, { ru: string; uz: string }> = {
  CASH: {
    ru: 'Оплата наличными при получении.',
    uz: 'Yetkazilganda naqd to\'lov.',
  },
  MANUAL_TRANSFER: {
    ru: 'Ручной перевод на карту/счет с подтверждением владельцем.',
    uz: 'Karta/hisobga qo\'lda o\'tkazma, egasi tasdiqlaydi.',
  },
  TELEGRAM: {
    ru: 'Telegram Payments: providerToken и currency (например UZS).',
    uz: 'Telegram Payments: providerToken va currency (masalan UZS).',
  },
  CLICK: {
    ru: 'Click: serviceId и merchantId обязательны. clickSecret/webhookSecret опционально.',
    uz: 'Click: serviceId va merchantId majburiy. clickSecret/webhookSecret ixtiyoriy.',
  },
  PAYME: {
    ru: 'Payme: merchantId обязателен. paymeAuthKey/webhookSecret опционально.',
    uz: 'Payme: merchantId majburiy. paymeAuthKey/webhookSecret ixtiyoriy.',
  },
  UZUM: {
    ru: 'Uzum Pay: используйте произвольные meta-поля в JSON ниже.',
    uz: 'Uzum Pay: pastdagi JSON orqali ixtiyoriy meta maydonlardan foydalaning.',
  },
  STRIPE: {
    ru: 'Stripe: используйте произвольные meta-поля в JSON ниже.',
    uz: 'Stripe: pastdagi JSON orqali ixtiyoriy meta maydonlardan foydalaning.',
  },
  CUSTOM: {
    ru: 'Любой внешний способ. Описание и инструкция задаются вручную.',
    uz: 'Istalgan tashqi usul. Tavsif va ko\'rsatma qo\'lda beriladi.',
  },
};

export const PROVIDER_DEFAULTS: Record<ProviderCode, { code: string; titleRu: string; titleUz: string }> = {
  CASH: { code: 'cash_on_delivery', titleRu: 'Наличными при получении', titleUz: 'Yetkazilganda naqd to\'lov' },
  MANUAL_TRANSFER: { code: 'manual_transfer', titleRu: 'Перевод на карту/счет', titleUz: 'Karta/hisobga o\'tkazma' },
  TELEGRAM: { code: 'telegram_payments', titleRu: 'Telegram Payments', titleUz: 'Telegram Payments' },
  CLICK: { code: 'click', titleRu: 'Click', titleUz: 'Click' },
  PAYME: { code: 'payme', titleRu: 'Payme', titleUz: 'Payme' },
  UZUM: { code: 'uzum', titleRu: 'Uzum Pay', titleUz: 'Uzum Pay' },
  STRIPE: { code: 'stripe', titleRu: 'Stripe', titleUz: 'Stripe' },
  CUSTOM: { code: 'custom_method', titleRu: 'Внешний способ оплаты', titleUz: 'Tashqi to\'lov usuli' },
};

export function emptyPaymentMethodForm(sortOrder = 0): FormState {
  return {
    provider: 'CUSTOM',
    code: '',
    title: '',
    description: '',
    instructions: '',
    isDefault: false,
    isActive: true,
    sortOrder,
    customMetaJson: '{}',
    tgProviderToken: '',
    tgCurrency: 'UZS',
    clickServiceId: '',
    clickMerchantId: '',
    clickSecret: '',
    clickWebhookSecret: '',
    paymeMerchantId: '',
    paymeAuthKey: '',
    paymeWebhookSecret: '',
  };
}

export function formFromMethod(method: any): FormState {
  const provider = (method.provider || 'CUSTOM') as ProviderCode;
  const meta = method.meta && typeof method.meta === 'object' ? method.meta : {};

  return {
    provider,
    code: method.code || '',
    title: method.title || '',
    description: method.description || '',
    instructions: method.instructions || '',
    isDefault: !!method.isDefault,
    isActive: method.isActive !== false,
    sortOrder: method.sortOrder || 0,
    customMetaJson: JSON.stringify(meta, null, 2),
    tgProviderToken: String(meta.providerToken || ''),
    tgCurrency: String(meta.currency || 'UZS'),
    clickServiceId: String(meta.serviceId || ''),
    clickMerchantId: String(meta.merchantId || ''),
    clickSecret: String(meta.clickSecret || ''),
    clickWebhookSecret: String(meta.webhookSecret || ''),
    paymeMerchantId: String(meta.merchantId || ''),
    paymeAuthKey: String(meta.paymeAuthKey || ''),
    paymeWebhookSecret: String(meta.webhookSecret || ''),
  };
}

export type TrFn = (ru: string, uz: string) => string;

function parseJsonObject(input: string): Record<string, any> {
  const raw = input.trim();
  if (!raw) return {};
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('meta must be an object');
  }
  return parsed;
}

function validateProvider(form: FormState, tr: TrFn): string | null {
  if (form.provider === 'TELEGRAM') {
    if (!form.tgProviderToken.trim()) return tr('Укажите providerToken для Telegram', 'Telegram uchun providerToken kiriting');
    if (!/^[A-Z]{3}$/.test(form.tgCurrency.trim().toUpperCase())) {
      return tr('Currency должна быть 3 буквы, например UZS', 'Currency 3 harf bo\'lishi kerak, masalan UZS');
    }
  }

  if (form.provider === 'CLICK') {
    if (!form.clickServiceId.trim()) return tr('Укажите serviceId для Click', 'Click uchun serviceId kiriting');
    if (!form.clickMerchantId.trim()) return tr('Укажите merchantId для Click', 'Click uchun merchantId kiriting');
  }

  if (form.provider === 'PAYME') {
    if (!form.paymeMerchantId.trim()) return tr('Укажите merchantId для Payme', 'Payme uchun merchantId kiriting');
  }

  return null;
}

function buildMeta(form: FormState): Record<string, any> | undefined {
  if (form.provider === 'TELEGRAM') {
    return {
      providerToken: form.tgProviderToken.trim(),
      currency: form.tgCurrency.trim().toUpperCase(),
    };
  }

  if (form.provider === 'CLICK') {
    return {
      serviceId: form.clickServiceId.trim(),
      merchantId: form.clickMerchantId.trim(),
      ...(form.clickSecret.trim() ? { clickSecret: form.clickSecret.trim() } : {}),
      ...(form.clickWebhookSecret.trim() ? { webhookSecret: form.clickWebhookSecret.trim() } : {}),
    };
  }

  if (form.provider === 'PAYME') {
    return {
      merchantId: form.paymeMerchantId.trim(),
      ...(form.paymeAuthKey.trim() ? { paymeAuthKey: form.paymeAuthKey.trim() } : {}),
      ...(form.paymeWebhookSecret.trim() ? { webhookSecret: form.paymeWebhookSecret.trim() } : {}),
    };
  }

  const parsed = parseJsonObject(form.customMetaJson);
  return Object.keys(parsed).length ? parsed : undefined;
}

export function buildPaymentMethodPayload(form: FormState, tr: TrFn) {
  const validationError = validateProvider(form, tr);
  if (validationError) {
    throw new Error(validationError);
  }

  let meta: Record<string, any> | undefined;
  try {
    meta = buildMeta(form);
  } catch {
    throw new Error(tr('Неверный JSON в поле Meta', "Meta maydonida JSON noto'g'ri"));
  }

  return {
    provider: form.provider,
    code: form.code.trim(),
    title: form.title.trim(),
    description: form.description.trim() || undefined,
    instructions: form.instructions.trim() || undefined,
    meta,
    isDefault: form.isDefault,
    isActive: form.isActive,
    sortOrder: Number(form.sortOrder || 0),
  };
}
