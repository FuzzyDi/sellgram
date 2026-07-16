import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { adminApi } from '../../api/store-admin-client';
import { useAdminI18n } from '../../i18n';
import Card from '../../components/Card';
import Button from '../../components/Button';

// Shared across PosDevices/PosOperators/PosSettings (docs/ADMIN_REDESIGN.md
// Phase 3, step 5) — store selection, plan-gate detection, and the
// sub-navigation between the three POS screens.

const POS_STORE_STORAGE_KEY = 'sellgram_admin_pos_store_id';

export function usePosStores() {
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
      const saved = localStorage.getItem(POS_STORE_STORAGE_KEY);
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
    localStorage.setItem(POS_STORE_STORAGE_KEY, id);
  }

  return { stores, storeId, selectStore, loading, loadError, reload: load };
}

// planGuard('posEnabled') on the API side responds 402 with a message
// containing "plan" (apps/api/src/plugins/plan-guard.ts) — same detection
// used by pages/Suppliers.tsx for its own plan-gated feature.
export function isPlanBlockedError(err: any): boolean {
  const msg = String(err?.message || '').toLowerCase();
  return msg.includes('402') || msg.includes('plan');
}

export function PosPlanBlocked() {
  const { tr } = useAdminI18n();
  const navigate = useNavigate();
  return (
    <Card className="text-center py-8 px-4">
      <div className="text-token-2xl mb-3">🔒</div>
      <p className="m-0 font-semibold text-token-lg text-neutral-800">
        {tr('POS не подключён', 'POS ulanmagan')}
      </p>
      <p className="mt-1.5 text-token-sm text-neutral-500">
        {tr(
          'Модуль кассы (POS) недоступен на вашем тарифе. Подключите его на странице тарифов.',
          "Kassa (POS) moduli tarifingizda mavjud emas. Uni tariflar sahifasida ulang."
        )}
      </p>
      <Button variant="primary" size="md" type="button" className="mt-4" onClick={() => navigate('/billing')}>
        {tr('Перейти к тарифам', "Tariflarga o'tish")}
      </Button>
    </Card>
  );
}

const POS_TABS: { to: string; ru: string; uz: string }[] = [
  { to: '/pos/analytics', ru: 'Аналитика', uz: 'Analitika' },
  { to: '/pos/devices', ru: 'Устройства', uz: 'Qurilmalar' },
  { to: '/pos/operators', ru: 'Кассиры', uz: 'Kassirlar' },
  { to: '/pos/shifts', ru: 'Смены', uz: 'Smenalar' },
  { to: '/pos/receipts', ru: 'Чеки', uz: 'Cheklar' },
  { to: '/pos/operator-events', ru: 'События', uz: 'Hodisalar' },
  { to: '/pos/settings', ru: 'Настройки', uz: 'Sozlamalar' },
];

export function PosSubNav() {
  const { tr } = useAdminI18n();
  const navigate = useNavigate();
  const pathname = useLocation().pathname;
  return (
    <div className="flex gap-1">
      {POS_TABS.map((tab) => {
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

export function PosStoreSelect({
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

export const POS_OPERATOR_ROLES = [
  { value: 'CASHIER', ru: 'Кассир', uz: 'Kassir' },
  { value: 'SENIOR_CASHIER', ru: 'Старший кассир', uz: 'Katta kassir' },
  { value: 'ADMIN', ru: 'Администратор', uz: 'Administrator' },
] as const;

export type PosOperatorRole = (typeof POS_OPERATOR_ROLES)[number]['value'];

export const POS_OPERATOR_ROLE_BADGE: Record<PosOperatorRole, 'neutral' | 'warning' | 'danger'> = {
  CASHIER: 'neutral',
  SENIOR_CASHIER: 'warning',
  ADMIN: 'danger',
};

// docs/POS_POLICY_ENGINE.md §14.6 — full confirmed permission vocabulary
// for PosOperator.permissions, grouped by the role that first grants
// each one (CASHIER's 8, then SENIOR_CASHIER's additional 9, then
// ADMIN's additional 7), same order as the §14.6 table itself.
export const POS_OPERATOR_PERMISSIONS = [
  'SHIFT_OPEN',
  'SALE_CREATE',
  'SALE_COMPLETE',
  'REFUND_CREATE_OWN_OR_BY_RECEIPT',
  'CUSTOMER_LOOKUP',
  'CUSTOMER_CREATE',
  'X_REPORT_PRINT',
  'REPRINT_RECEIPT_COPY',
  'SHIFT_CLOSE',
  'REFUND_APPROVE',
  'REFUND_COMPLETE',
  'DISCOUNT_APPLY',
  'PRICE_OVERRIDE_LIMITED',
  'CASH_IN',
  'CASH_OUT',
  'VIEW_SHIFT_TOTALS',
  'RECOVERY_RECEIPTS',
  'POS_SETTINGS_EDIT',
  'HARDWARE_SETTINGS_EDIT',
  'OPERATOR_SWITCH',
  'POLICY_VIEW',
  'FORCE_SYNC',
  'OUTBOX_REQUEUE',
  'DEV_DIAGNOSTICS',
] as const;

// Human-readable labels for POS_OPERATOR_PERMISSIONS — displayed instead
// of the raw permission code in PosOperators.tsx's table and form.
export const PERMISSION_LABELS: Record<string, { ru: string; uz: string }> = {
  SHIFT_OPEN:                       { ru: 'Открыть смену',                 uz: 'Smenani ochish' },
  SHIFT_CLOSE:                      { ru: 'Закрыть смену',                 uz: 'Smenani yopish' },
  SALE_CREATE:                      { ru: 'Создать продажу',               uz: 'Sotuv yaratish' },
  SALE_COMPLETE:                    { ru: 'Завершить продажу',             uz: 'Sotuvni yakunlash' },
  REFUND_CREATE_OWN_OR_BY_RECEIPT:  { ru: 'Возврат по чеку',               uz: "Kvitansiya bo'yicha qaytarish" },
  REFUND_APPROVE:                   { ru: 'Одобрить возврат',              uz: 'Qaytarishni tasdiqlash' },
  REFUND_COMPLETE:                  { ru: 'Завершить возврат',             uz: 'Qaytarishni yakunlash' },
  CUSTOMER_LOOKUP:                  { ru: 'Поиск клиента',                 uz: 'Mijozni qidirish' },
  CUSTOMER_CREATE:                  { ru: 'Создать клиента',               uz: 'Mijoz yaratish' },
  X_REPORT_PRINT:                   { ru: 'X-отчёт',                       uz: 'X-hisobot' },
  REPRINT_RECEIPT_COPY:             { ru: 'Копия чека',                    uz: 'Kvitansiya nusxasi' },
  DISCOUNT_APPLY:                   { ru: 'Применить скидку',              uz: "Chegirma qo'llash" },
  PRICE_OVERRIDE_LIMITED:           { ru: 'Изменить цену',                 uz: "Narxni o'zgartirish" },
  CASH_IN:                          { ru: 'Внесение наличных',             uz: 'Naqd kiritish' },
  CASH_OUT:                         { ru: 'Изъятие наличных',              uz: 'Naqd chiqarish' },
  VIEW_SHIFT_TOTALS:                { ru: 'Итоги смены',                   uz: 'Smena yakunlari' },
  RECOVERY_RECEIPTS:                { ru: 'Восстановление чеков',          uz: 'Kvitansiyalarni tiklash' },
  POS_SETTINGS_EDIT:                { ru: 'Настройки POS',                 uz: 'POS sozlamalari' },
  HARDWARE_SETTINGS_EDIT:           { ru: 'Настройки оборудования',        uz: 'Uskunalar sozlamalari' },
  OPERATOR_SWITCH:                  { ru: 'Смена оператора',               uz: 'Operatorni almashtirish' },
  POLICY_VIEW:                      { ru: 'Просмотр политик',              uz: "Siyosatlarni ko'rish" },
  FORCE_SYNC:                       { ru: 'Принудительная синхронизация',  uz: 'Majburiy sinxronizatsiya' },
  OUTBOX_REQUEUE:                   { ru: 'Повторная отправка',            uz: 'Qayta yuborish' },
  DEV_DIAGNOSTICS:                  { ru: 'Диагностика (dev)',             uz: 'Diagnostika (dev)' },
};

// Mirrors apps/api/src/modules/pos-sync/admin-routes.ts's server-side
// DEFAULT_PERMISSIONS exactly (§14.6) — used client-side to pre-fill the
// permission checkboxes when a role is picked in the operator form
// (PosOperators.tsx), so the admin sees the default set immediately
// instead of it only appearing after a round-trip to the server.
export const POS_OPERATOR_DEFAULT_PERMISSIONS: Record<PosOperatorRole, string[]> = {
  CASHIER: [
    'SHIFT_OPEN', 'SALE_CREATE', 'SALE_COMPLETE',
    'REFUND_CREATE_OWN_OR_BY_RECEIPT', 'CUSTOMER_LOOKUP',
    'CUSTOMER_CREATE', 'X_REPORT_PRINT', 'REPRINT_RECEIPT_COPY',
  ],
  SENIOR_CASHIER: [
    'SHIFT_OPEN', 'SALE_CREATE', 'SALE_COMPLETE',
    'REFUND_CREATE_OWN_OR_BY_RECEIPT', 'CUSTOMER_LOOKUP',
    'CUSTOMER_CREATE', 'X_REPORT_PRINT', 'REPRINT_RECEIPT_COPY',
    'SHIFT_CLOSE', 'REFUND_APPROVE', 'REFUND_COMPLETE',
    'DISCOUNT_APPLY', 'PRICE_OVERRIDE_LIMITED', 'CASH_IN',
    'CASH_OUT', 'VIEW_SHIFT_TOTALS', 'RECOVERY_RECEIPTS',
  ],
  ADMIN: [
    'SHIFT_OPEN', 'SALE_CREATE', 'SALE_COMPLETE',
    'REFUND_CREATE_OWN_OR_BY_RECEIPT', 'CUSTOMER_LOOKUP',
    'CUSTOMER_CREATE', 'X_REPORT_PRINT', 'REPRINT_RECEIPT_COPY',
    'SHIFT_CLOSE', 'REFUND_APPROVE', 'REFUND_COMPLETE',
    'DISCOUNT_APPLY', 'PRICE_OVERRIDE_LIMITED', 'CASH_IN',
    'CASH_OUT', 'VIEW_SHIFT_TOTALS', 'RECOVERY_RECEIPTS',
    'POS_SETTINGS_EDIT', 'HARDWARE_SETTINGS_EDIT', 'OPERATOR_SWITCH',
    'POLICY_VIEW', 'FORCE_SYNC', 'OUTBOX_REQUEUE', 'DEV_DIAGNOSTICS',
  ],
};
