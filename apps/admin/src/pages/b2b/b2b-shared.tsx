import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { adminApi } from '../../api/store-admin-client';
import { useAdminI18n } from '../../i18n';
import Card from '../../components/Card';
import Button from '../../components/Button';
import type { BadgeVariant } from '../../components/Badge';

// Shared across B2bCounterparties/B2bCounterpartyDetail/B2bOrders
// (docs/ADMIN_REDESIGN.md Phase 3, step 6) — store selection, the
// b2bEnabled module-toggle check, and sub-navigation, mirroring
// pages/pos/pos-shared.tsx.

const B2B_STORE_STORAGE_KEY = 'sellgram_admin_b2b_store_id';

export function useB2bStores() {
  const [stores, setStores] = useState<any[]>([]);
  const [storeId, setStoreIdState] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  async function load() {
    setLoading(true);
    setLoadError(false);
    try {
      const list = await adminApi.getStores();
      const normalized = Array.isArray(list) ? list : [];
      setStores(normalized);
      const saved = localStorage.getItem(B2B_STORE_STORAGE_KEY);
      const initial = normalized.find((s: any) => s.id === saved)?.id || normalized[0]?.id || '';
      setStoreIdState(initial);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function selectStore(id: string) {
    setStoreIdState(id);
    localStorage.setItem(B2B_STORE_STORAGE_KEY, id);
  }

  return { stores, storeId, selectStore, loading, loadError, reload: load };
}

// Tenant.b2bEnabled is a plain per-tenant boolean (docs/B2B_COUNTERPARTIES.md
// §9) — unlike posEnabled it is NOT wired into planGuard()/PLANS, so there
// is no 402 to catch here (contrast pos-shared.tsx's isPlanBlockedError).
// It only reaches the frontend via /auth/me's tenant object.
export function useB2bEnabled() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(true);

  async function check() {
    setChecking(true);
    try {
      const me = await adminApi.me();
      setEnabled(Boolean(me?.tenant?.b2bEnabled));
    } catch {
      setEnabled(false);
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => { void check(); }, []);

  return { enabled, checking, recheck: check };
}

export function B2bNotEnabled({ onEnabled }: { onEnabled: () => void }) {
  const { tr } = useAdminI18n();
  const [enabling, setEnabling] = useState(false);
  const [error, setError] = useState('');

  async function enable() {
    setEnabling(true);
    setError('');
    try {
      await adminApi.updateB2bSettings(true);
      onEnabled();
    } catch (err: any) {
      setError(err?.message || tr('Не удалось включить B2B', "B2B ni yoqib bo'lmadi"));
    } finally {
      setEnabling(false);
    }
  }

  return (
    <Card className="text-center py-8 px-4">
      <div className="text-token-2xl mb-3">🤝</div>
      <p className="m-0 font-semibold text-token-lg text-neutral-800">
        {tr('B2B/Опт ещё не подключён', 'B2B/Optom hali ulanmagan')}
      </p>
      <p className="mt-1.5 text-token-sm text-neutral-500">
        {tr(
          'Включите модуль контрагентов и оптовых заказов — это бесплатно на любом тарифе.',
          "Kontragentlar va optom buyurtmalar modulini yoqing — bu har qanday tarifda bepul."
        )}
      </p>
      {error && <p className="mt-2 text-token-xs text-danger">{error}</p>}
      <Button variant="primary" size="md" type="button" className="mt-4" onClick={enable} disabled={enabling}>
        {enabling ? tr('Включение...', 'Yoqilmoqda...') : tr('Подключить B2B', "B2B ni ulash")}
      </Button>
    </Card>
  );
}

const B2B_TABS: { to: string; ru: string; uz: string }[] = [
  { to: '/b2b/counterparties', ru: 'Контрагенты', uz: 'Kontragentlar' },
  { to: '/b2b/orders', ru: 'Заказы', uz: 'Buyurtmalar' },
];

export function B2bSubNav() {
  const { tr } = useAdminI18n();
  const navigate = useNavigate();
  const pathname = useLocation().pathname;
  return (
    <div className="flex gap-1">
      {B2B_TABS.map((tab) => {
        const active = pathname.startsWith(tab.to);
        return (
          <Button
            key={tab.to}
            type="button"
            variant={active ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => navigate(tab.to)}
          >
            {tr(tab.ru, tab.uz)}
          </Button>
        );
      })}
    </div>
  );
}

export function B2bStoreSelect({
  stores, storeId, onChange,
}: { stores: any[]; storeId: string; onChange: (id: string) => void }) {
  const { tr } = useAdminI18n();
  return (
    <Card>
      <label className="block text-token-sm font-medium text-neutral-700 mb-1.5">
        {tr('Магазин', "Do'kon")}
      </label>
      <select
        value={storeId}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-token-md border border-neutral-300 px-3 py-2 text-token-sm text-neutral-800 bg-white focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500"
      >
        {stores.map((store) => (
          <option key={store.id} value={store.id}>{store.name}</option>
        ))}
      </select>
    </Card>
  );
}

export const COUNTERPARTY_TYPES = [
  { value: 'INDIVIDUAL', ru: 'Физлицо', uz: 'Jismoniy shaxs' },
  { value: 'ORGANIZATION', ru: 'Организация', uz: 'Tashkilot' },
] as const;

export type CounterpartyType = (typeof COUNTERPARTY_TYPES)[number]['value'];

export const COUNTERPARTY_TYPE_BADGE: Record<CounterpartyType, BadgeVariant> = {
  INDIVIDUAL: 'neutral',
  ORGANIZATION: 'info',
};

export const LEDGER_TYPE_BADGE: Record<string, BadgeVariant> = {
  ORDER_CHARGE: 'danger',
  PAYMENT_RECEIVED: 'success',
  ADJUSTMENT: 'warning',
};

export function ledgerTypeLabel(type: string, tr: (ru: string, uz: string) => string): string {
  switch (type) {
    case 'ORDER_CHARGE': return tr('Заказ', 'Buyurtma');
    case 'PAYMENT_RECEIVED': return tr('Оплата', "To'lov");
    case 'ADJUSTMENT': return tr('Корректировка', 'Tuzatish');
    default: return type;
  }
}

// currentDebt > 0 owed to us (danger), < 0 an advance/credit in the
// counterparty's favor (success), = 0 settled (neutral) — see
// order.service.ts's ORDER_CHARGE/PAYMENT_RECEIVED sign convention.
export function debtClassName(debt: number): string {
  if (debt > 0) return 'text-danger';
  if (debt < 0) return 'text-success';
  return 'text-neutral-500';
}

export function B2bHeader({ tr, title, subtitle }: { tr: (ru: string, uz: string) => string; title: string; subtitle: string }) {
  return (
    <header className="flex items-start justify-between gap-3 flex-wrap">
      <div>
        <h2 className="text-token-2xl font-semibold text-neutral-800 flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-channel-b2b" aria-hidden="true" />
          B2B · {title}
        </h2>
        <p className="mt-1 text-token-sm text-neutral-500">{subtitle}</p>
      </div>
    </header>
  );
}
