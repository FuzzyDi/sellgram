import { PaymentPreparationInput, PaymentPreparationResult, StorePaymentProvider } from '../types.js';

export const clickProvider: StorePaymentProvider = {
  provider: 'CLICK',
  prepare(input: PaymentPreparationInput): PaymentPreparationResult {
    const meta = input.method.meta || {};
    const serviceId = String(meta['serviceId'] || '').trim();
    const merchantId = String(meta['merchantId'] || '').trim();

    // merchant_trans_id: storeId:orderNumber format, webhook normalizer parses this correctly
    const merchantTransId = `${input.storeId}:${input.orderNumber}`;

    let paymentUrl: string | undefined;
    if (serviceId && merchantId) {
      const params = new URLSearchParams({
        service_id: serviceId,
        merchant_id: merchantId,
        amount: String(input.totalAmount),
        transaction_param: merchantTransId,
      });
      paymentUrl = `https://my.click.uz/services/pay?${params.toString()}`;
    }

    return {
      paymentMethod: 'CLICK',
      paymentStatus: 'PENDING',
      paymentMeta: {
        mode: 'external_provider',
        provider: 'CLICK',
        orderNumber: input.orderNumber,
        merchantTransId,
        instructions: input.method.instructions || null,
        ...(paymentUrl ? { paymentUrl } : {}),
        ...(meta['clickSecret'] ? { clickSecret: meta['clickSecret'] } : {}),
        ...(meta['webhookSecret'] ? { webhookSecret: meta['webhookSecret'] } : {}),
      },
    };
  },
};
