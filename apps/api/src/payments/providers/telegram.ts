import { PaymentPreparationInput, PaymentPreparationResult, StorePaymentProvider } from '../types.js';

const TELEGRAM_MINOR_UNITS: Record<string, number> = {
  UZS: 2,
  USD: 2,
  EUR: 2,
  RUB: 2,
};

export const telegramProvider: StorePaymentProvider = {
  provider: 'TELEGRAM',
  prepare(input: PaymentPreparationInput): PaymentPreparationResult {
    const meta = input.method.meta || {};
    const providerToken = String(meta.providerToken || '').trim();
    const currency = String(meta.currency || input.currency || 'UZS').trim().toUpperCase();
    const exp = TELEGRAM_MINOR_UNITS[currency] ?? 2;
    const amountInMinor = Math.round(Number(input.totalAmount || 0) * Math.pow(10, exp));

    return {
      paymentMethod: 'TELEGRAM',
      paymentStatus: 'PENDING',
      paymentMeta: {
        mode: 'telegram_payments',
        providerToken,
        currency,
        amount: amountInMinor,
        title: input.method.title,
        description: input.method.description || `Order #${input.orderNumber}`,
        payload: `sellgram:${input.storeId}:${input.orderNumber}`,
        ...(meta || {}),
      },
    };
  },
};
