import React from 'react';
import { useAdminI18n } from '../../i18n';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Badge, { type BadgeVariant } from '../../components/Badge';

export const RECEIPT_TYPE_BADGE: Record<string, BadgeVariant> = {
  SALE: 'success',
  REFUND: 'danger',
};

// operatorRole is the till's own free-form snapshot string
// (docs/POS_POLICY_ENGINE.md §14.1) — lowercase/underscore convention as
// sent by the device, distinct from PosOperator.role's uppercase enum
// (POS_OPERATOR_ROLES in pos-shared.tsx), so it gets its own small label
// map rather than reusing that one.
export const OPERATOR_ROLE_LABEL: Record<string, [string, string]> = {
  cashier: ['Кассир', 'Kassir'],
  senior_cashier: ['Старший кассир', 'Katta kassir'],
  admin: ['Администратор', 'Administrator'],
};

// fiscalStatus is a free-form string on the wire (docs/POS_SYNC_API.md
// §12/§703) — no fixed enum to map exactly, so this is a best-effort
// heuristic on common substrings rather than a literal lookup table.
export function statusBadgeVariant(status: string): BadgeVariant {
  const s = String(status || '').toUpperCase();
  if (s.includes('SUCCESS') || s.includes('OK') || s.includes('DONE')) return 'success';
  if (s.includes('FAIL') || s.includes('ERROR')) return 'danger';
  if (s.includes('PENDING') || s.includes('WAIT')) return 'warning';
  return 'neutral';
}

// items/payments are stored as unconstrained Json (z.record(z.unknown())
// on the wire, docs/POS_SYNC_API.md — same "loose bag, shape settles with
// real usage" reasoning as rawFiscalPayload/PlatformPolicy.extra). These
// readers pick the most plausible key aliases a till might send and fall
// back to a raw dump if nothing recognizable is present.
export function pick(obj: any, keys: string[]): any {
  for (const k of keys) if (obj?.[k] !== undefined && obj[k] !== null) return obj[k];
  return undefined;
}

// The real Android fiscal contract (confirmed against production
// fiscal_events, not the grams-only assumption this used to make):
// EVERY item's `qty` is milli-units — always ÷1000, regardless of
// whether the item is weighed or counted. A piece item reports
// qty=1000/unitCode="шт"/isByWeight=false for "1 шт"; a weighed item
// reports qty=1250/unitCode="кг"/isByWeight=true for "1.250 кг". There
// is no separate gram-only encoding — WEIGHT_G_UNITS never appeared in
// real data and is gone. Exact-string unit matching, not case-folded
// beyond the literal кг/KG/kg forms actually seen on the wire.
export const WEIGHT_KG_UNITS = ['кг', 'KG', 'kg'];

export function formatItemQty(item: any): string {
  const qty = pick(item, ['qty', 'quantity']);
  if (qty === undefined) return '—';
  const unit = pick(item, ['unit', 'unitCode']);
  const isByWeight = item?.isByWeight === true;
  const displayQty = Number(qty) / 1000;
  if (WEIGHT_KG_UNITS.includes(unit) || isByWeight) {
    return `${displayQty.toFixed(3)} кг`;
  }
  return `${Number.isInteger(displayQty) ? displayQty : displayQty.toFixed(3)} шт`;
}

export function formatItemPrice(item: any): string {
  const price = pick(item, ['price', 'unitPrice']);
  if (price === undefined) return '—';
  const unit = pick(item, ['unit', 'unitCode']);
  if (WEIGHT_KG_UNITS.includes(unit)) return `${price}/кг`;
  return String(price);
}

export function ReceiptItemsTable({ items }: { items: any[] }) {
  const { tr } = useAdminI18n();
  if (!items?.length) return <p className="text-token-sm text-neutral-500">{tr('Нет позиций', "Pozitsiyalar yo'q")}</p>;
  return (
    <table className="w-full text-token-sm border-collapse">
      <thead>
        <tr className="border-b border-neutral-200">
          <th className="text-left py-1.5 pr-2 text-token-xs font-semibold text-neutral-500 uppercase">{tr('Название', 'Nomi')}</th>
          <th className="text-right py-1.5 px-2 text-token-xs font-semibold text-neutral-500 uppercase">{tr('Кол-во', 'Soni')}</th>
          <th className="text-right py-1.5 px-2 text-token-xs font-semibold text-neutral-500 uppercase">{tr('Цена', 'Narxi')}</th>
          <th className="text-right py-1.5 pl-2 text-token-xs font-semibold text-neutral-500 uppercase">{tr('Сумма', 'Summa')}</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item, i) => (
          <tr key={i} className="border-b border-neutral-100 last:border-0">
            <td className="py-1.5 pr-2 text-neutral-800">{pick(item, ['name', 'title', 'productName']) ?? '—'}</td>
            <td className="py-1.5 px-2 text-right text-neutral-600">{formatItemQty(item)}</td>
            <td className="py-1.5 px-2 text-right text-neutral-600">{formatItemPrice(item)}</td>
            <td className="py-1.5 pl-2 text-right font-semibold text-neutral-800">{pick(item, ['sum', 'total', 'amount']) ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ReceiptPaymentsTable({ payments }: { payments: any[] }) {
  const { tr } = useAdminI18n();
  if (!payments?.length) return <p className="text-token-sm text-neutral-500">{tr('Нет оплат', "To'lovlar yo'q")}</p>;
  return (
    <table className="w-full text-token-sm border-collapse">
      <thead>
        <tr className="border-b border-neutral-200">
          <th className="text-left py-1.5 pr-2 text-token-xs font-semibold text-neutral-500 uppercase">{tr('Тип', 'Turi')}</th>
          <th className="text-right py-1.5 pl-2 text-token-xs font-semibold text-neutral-500 uppercase">{tr('Сумма', 'Summa')}</th>
        </tr>
      </thead>
      <tbody>
        {payments.map((p, i) => (
          <tr key={i} className="border-b border-neutral-100 last:border-0">
            <td className="py-1.5 pr-2 text-neutral-800">{pick(p, ['type', 'method', 'paymentType']) ?? '—'}</td>
            <td className="py-1.5 pl-2 text-right font-semibold text-neutral-800">{pick(p, ['sum', 'amount', 'total']) ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ReceiptDetailModal({ receipt, onClose, locale, tr }: {
  receipt: any; onClose: () => void; locale: string; tr: (ru: string, uz: string) => string;
}) {
  return (
    <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <Card className="w-full max-w-[560px] max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="m-0 mb-1 text-token-base font-semibold text-neutral-800">
          {tr('Чек', 'Chek')} №{receipt.receiptNumber || receipt.localReceiptId}
        </h3>
        <p className="text-token-xs text-neutral-500 mb-3">
          {new Date(receipt.createdAtMs).toLocaleString(locale)} · {receipt.device?.name || '—'} · {tr('Смена', 'Smena')} {receipt.shiftNumber}
        </p>

        <div className="mb-4">
          <div className="text-token-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1.5">
            {tr('Позиции', 'Pozitsiyalar')}
          </div>
          <ReceiptItemsTable items={receipt.items} />
        </div>

        {receipt.operatorName && (
          <div className="mb-4">
            <div className="text-token-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1.5">
              {tr('Кассир', 'Kassir')}
            </div>
            <div className="rounded-token-md border border-neutral-200 bg-neutral-50 px-3 py-2.5 flex justify-between gap-3 text-token-sm">
              <span className="font-semibold text-neutral-800">{receipt.operatorName}</span>
              <span className="text-neutral-500">
                {receipt.operatorRole
                  ? tr(...(OPERATOR_ROLE_LABEL[receipt.operatorRole] || [receipt.operatorRole, receipt.operatorRole]))
                  : '—'}
              </span>
            </div>
          </div>
        )}

        <div className="mb-4">
          <div className="text-token-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1.5">
            {tr('Оплаты', "To'lovlar")}
          </div>
          <ReceiptPaymentsTable payments={receipt.payments} />
        </div>

        <div>
          <div className="text-token-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1.5">
            {tr('Фискальные данные', "Fiskal ma'lumotlar")}
          </div>
          <div className="rounded-token-md border border-neutral-200 bg-neutral-50 px-3 py-2.5 flex flex-col gap-1.5 text-token-sm">
            <div className="flex justify-between gap-3">
              <span className="text-neutral-500">{tr('Статус', 'Holat')}</span>
              <Badge variant={statusBadgeVariant(receipt.fiscalStatus)}>{receipt.fiscalStatus}</Badge>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-neutral-500">{tr('Сумма', 'Summa')}</span>
              {/* totalAmount is stored in tiyin (Int, schema.prisma FiscalEvent.totalAmount;
                  confirmed by the /100 conversion in pos-sync/routes.ts's loyalty accrual) — divide
                  by 100 for display, matching every other consumer of this field. */}
              <span className="font-semibold text-neutral-800">{(Number(receipt.totalAmount) / 100).toLocaleString(locale)} {receipt.currency}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-neutral-500">ФП (fiscalSign)</span>
              <span className="font-mono text-token-xs text-neutral-700 break-all text-right">{receipt.fiscalSign || '—'}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-neutral-500">QR</span>
              <span className="font-mono text-token-xs text-neutral-700 break-all text-right">{receipt.fiscalQr || '—'}</span>
            </div>
          </div>
        </div>

        <div className="flex justify-end mt-4">
          <Button variant="primary" size="md" type="button" onClick={onClose}>
            {tr('Закрыть', 'Yopish')}
          </Button>
        </div>
      </Card>
    </div>
  );
}
