import { PaymentPreparationInput, PaymentPreparationResult, StorePaymentProvider } from '../types.js';

export const manualTransferProvider: StorePaymentProvider = {
  provider: 'MANUAL_TRANSFER',
  prepare(input: PaymentPreparationInput): PaymentPreparationResult {
    return {
      paymentMethod: 'MANUAL_TRANSFER',
      paymentStatus: 'PENDING',
      paymentMeta: {
        mode: 'manual_transfer',
        orderNumber: input.orderNumber,
        instructions: input.method.instructions || null,
        ...(input.method.meta || {}),
      },
    };
  },
};
