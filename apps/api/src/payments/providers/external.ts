import { PaymentPreparationInput, PaymentPreparationResult, StorePaymentProvider } from '../types.js';

function mapProvider(provider: string): PaymentPreparationResult['paymentMethod'] {
  switch (provider) {
    case 'CLICK':
      return 'CLICK';
    case 'PAYME':
      return 'PAYME';
    case 'UZUM':
      return 'UZUM';
    case 'STRIPE':
      return 'STRIPE';
    default:
      return 'CUSTOM';
  }
}

export const externalProvider: StorePaymentProvider = {
  provider: 'CUSTOM',
  prepare(input: PaymentPreparationInput): PaymentPreparationResult {
    return {
      paymentMethod: mapProvider(input.method.provider),
      paymentStatus: 'PENDING',
      paymentMeta: {
        mode: 'external_provider',
        provider: input.method.provider,
        orderNumber: input.orderNumber,
        instructions: input.method.instructions || null,
        ...(input.method.meta || {}),
      },
    };
  },
};
