import { cashProvider } from './providers/cash.js';
import { manualTransferProvider } from './providers/manual-transfer.js';
import { telegramProvider } from './providers/telegram.js';
import { clickProvider } from './providers/click.js';
import { paymeProvider } from './providers/payme.js';
import { externalProvider } from './providers/external.js';
import { StorePaymentProvider, StoreProviderCode } from './types.js';

const providerMap: Partial<Record<StoreProviderCode, StorePaymentProvider>> = {
  CASH: cashProvider,
  MANUAL_TRANSFER: manualTransferProvider,
  TELEGRAM: telegramProvider,
  CLICK: clickProvider,
  PAYME: paymeProvider,
  UZUM: externalProvider,
  STRIPE: externalProvider,
  CUSTOM: externalProvider,
};

export function getPaymentProvider(provider: StoreProviderCode): StorePaymentProvider {
  return providerMap[provider] || externalProvider;
}
