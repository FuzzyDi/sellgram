import { PaymentPreparationInput, PaymentPreparationResult, StorePaymentProvider } from '../types.js';

export const cashProvider: StorePaymentProvider = {
  provider: 'CASH',
  prepare(_input: PaymentPreparationInput): PaymentPreparationResult {
    return {
      paymentMethod: 'CASH_ON_DELIVERY',
      paymentStatus: 'PENDING',
      paymentMeta: { mode: 'cash_on_delivery' },
    };
  },
};
