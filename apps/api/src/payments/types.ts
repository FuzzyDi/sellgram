export type StoreProviderCode =
  | 'CASH'
  | 'MANUAL_TRANSFER'
  | 'TELEGRAM'
  | 'CLICK'
  | 'PAYME'
  | 'UZUM'
  | 'STRIPE'
  | 'CUSTOM';

export type OrderPaymentMethodCode =
  | 'CASH_ON_DELIVERY'
  | 'MANUAL_TRANSFER'
  | 'TELEGRAM'
  | 'CLICK'
  | 'PAYME'
  | 'UZUM'
  | 'STRIPE'
  | 'CUSTOM';

export type OrderPaymentStatusCode = 'PENDING' | 'PAID' | 'REFUNDED';

export interface StorePaymentMethodInput {
  provider: StoreProviderCode;
  code: string;
  title: string;
  description?: string | null;
  instructions?: string | null;
  meta?: Record<string, any> | null;
}

export interface PaymentPreparationInput {
  method: StorePaymentMethodInput;
  tenantId: string;
  storeId: string;
  customerId: string;
  orderNumber: number;
  totalAmount: number;
  currency: string;
}

export interface PaymentPreparationResult {
  paymentMethod: OrderPaymentMethodCode;
  paymentStatus: OrderPaymentStatusCode;
  paymentMeta?: Record<string, any>;
}

export interface StorePaymentProvider {
  provider: StoreProviderCode;
  prepare(input: PaymentPreparationInput): PaymentPreparationResult;
}
