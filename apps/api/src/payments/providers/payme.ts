import { PaymentPreparationInput, PaymentPreparationResult, StorePaymentProvider } from '../types.js';

export const paymeProvider: StorePaymentProvider = {
  provider: 'PAYME',
  prepare(input: PaymentPreparationInput): PaymentPreparationResult {
    const meta = input.method.meta || {};
    const merchantId = String(meta['merchantId'] || '').trim();

    let paymentUrl: string | undefined;
    if (merchantId) {
      // Payme amount is in tiyin (1 UZS = 100 tiyin)
      const amountTiyin = Math.round(input.totalAmount * 100);
      // Encode payment params: separate account fields so webhook normalizer can look up by orderNumber+storeId
      const encoded = Buffer.from(
        `m=${merchantId};ac.orderNumber=${input.orderNumber};ac.storeId=${input.storeId};a=${amountTiyin}`
      ).toString('base64');
      paymentUrl = `https://checkout.paycom.uz/${encoded}`;
    }

    return {
      paymentMethod: 'PAYME',
      paymentStatus: 'PENDING',
      paymentMeta: {
        mode: 'external_provider',
        provider: 'PAYME',
        orderNumber: input.orderNumber,
        instructions: input.method.instructions || null,
        ...(paymentUrl ? { paymentUrl } : {}),
        ...(meta['paymeAuthKey'] ? { paymeAuthKey: meta['paymeAuthKey'] } : {}),
        ...(meta['webhookSecret'] ? { webhookSecret: meta['webhookSecret'] } : {}),
      },
    };
  },
};
