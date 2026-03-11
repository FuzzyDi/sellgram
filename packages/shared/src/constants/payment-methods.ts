export const PAYMENT_PROVIDER_PRESETS = [
  { code: 'cash', provider: 'CASH', title: 'Cash On Delivery' },
  { code: 'manual_transfer', provider: 'MANUAL_TRANSFER', title: 'Bank Transfer' },
  { code: 'click', provider: 'CLICK', title: 'Click' },
  { code: 'payme', provider: 'PAYME', title: 'Payme' },
  { code: 'uzum', provider: 'UZUM', title: 'Uzum' },
  { code: 'stripe', provider: 'STRIPE', title: 'Stripe' },
] as const;

export type PaymentPreset = (typeof PAYMENT_PROVIDER_PRESETS)[number];
