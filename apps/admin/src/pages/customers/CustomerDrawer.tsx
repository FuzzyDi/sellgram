import React, { useEffect, useState } from 'react';
import { adminApi } from '../../api/store-admin-client';
import Button from '../../components/Button';
import Input from '../../components/Input';

const ORDER_STATUS_LABEL: Record<string, string> = {
  NEW: '🆕 Новый', CONFIRMED: '✅ Подтверждён', PREPARING: '👨‍🍳 Готовится',
  READY: '📦 Готов', SHIPPED: '🚚 В пути', DELIVERED: '📬 Доставлен',
  COMPLETED: '🎉 Завершён', CANCELLED: '❌ Отменён', REFUNDED: '↩️ Возврат',
};

interface CustomerDrawerProps {
  customerId: string;
  onClose: () => void;
  tr: (ru: string, uz: string) => string;
}

export default function CustomerDrawer({ customerId, onClose, tr }: CustomerDrawerProps) {
  const [customer, setCustomer] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');
  const [editNote, setEditNote] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [loyaltyDelta, setLoyaltyDelta] = useState('');
  const [loyaltyDesc, setLoyaltyDesc] = useState('');
  const [adjustingLoyalty, setAdjustingLoyalty] = useState(false);
  const [loyaltyError, setLoyaltyError] = useState('');

  useEffect(() => {
    setLoading(true);
    adminApi.getCustomer(customerId)
      .then((data) => {
        setCustomer(data);
        setNote(data.note || '');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [customerId]);

  async function saveNote() {
    setSavingNote(true);
    try {
      await adminApi.updateCustomer(customerId, { note: note || null });
      setCustomer((c: any) => ({ ...c, note: note || null }));
      setEditNote(false);
    } catch { /* ignore */ } finally { setSavingNote(false); }
  }

  async function submitLoyalty() {
    const pts = parseInt(loyaltyDelta, 10);
    if (!pts || pts === 0) return;
    setAdjustingLoyalty(true);
    setLoyaltyError('');
    try {
      const result = await adminApi.adjustCustomerLoyalty(customerId, pts, loyaltyDesc || undefined);
      setCustomer((c: any) => ({ ...c, loyaltyPoints: result.loyaltyPoints }));
      setLoyaltyDelta('');
      setLoyaltyDesc('');
    } catch (err: any) {
      setLoyaltyError(err?.message || tr('Ошибка', 'Xatolik'));
    } finally { setAdjustingLoyalty(false); }
  }

  const displayName = customer
    ? [customer.firstName, customer.lastName].filter(Boolean).join(' ') || customer.telegramUser || customer.id
    : '…';

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} className="fixed inset-0 bg-black/35 z-[300]" />

      {/* Drawer */}
      <aside className="fixed top-0 right-0 bottom-0 w-[480px] max-w-[95vw] bg-white z-[301] overflow-y-auto shadow-[-4px_0_32px_rgba(0,0,0,0.12)] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200">
          <h2 className="m-0 text-token-xl font-semibold text-neutral-800">{tr('Профиль клиента', 'Mijoz profili')}</h2>
          <Button variant="ghost" size="sm" type="button" onClick={onClose}>✕</Button>
        </div>

        {loading ? (
          <div className="p-5 flex flex-col gap-2.5">
            {[80, 50, 60, 40].map((w, i) => (
              <div key={i} className="h-3.5 rounded-token-sm bg-neutral-100 animate-pulse" style={{ width: `${w}%` }} />
            ))}
          </div>
        ) : !customer ? (
          <div className="p-8 text-center font-semibold text-danger">
            {tr('Клиент не найден', 'Mijoz topilmadi')}
          </div>
        ) : (
          <div className="p-5 flex flex-col gap-4">
            {/* Avatar + name */}
            <div className="flex gap-3.5 items-center">
              <div className="w-14 h-14 rounded-full bg-accent-600 text-white flex items-center justify-center text-token-xl font-semibold flex-shrink-0">
                {((customer.firstName?.[0] || '') + (customer.lastName?.[0] || '')).toUpperCase() || '?'}
              </div>
              <div>
                <div className="font-semibold text-token-lg text-neutral-800">{displayName}</div>
                {customer.telegramUser && (
                  <div className="text-token-sm text-neutral-500">@{customer.telegramUser}</div>
                )}
                {customer.phone && (
                  <div className="text-token-sm text-neutral-500">{customer.phone}</div>
                )}
                <div className="text-token-xs text-neutral-400 mt-0.5">
                  {tr('С нами с', 'Biz bilan')}: {new Date(customer.createdAt).toLocaleDateString()}
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: tr('Заказов', 'Buyurtmalar'), value: customer.ordersCount ?? 0 },
                { label: tr('Потрачено', 'Sarflagan'), value: `${Number(customer.totalSpent ?? 0).toLocaleString()} UZS` },
                { label: tr('Баллы', 'Ballar'), value: customer.loyaltyPoints ?? 0 },
              ].map((s) => (
                <div key={s.label} className="bg-neutral-50 rounded-token-md px-2 py-2.5 text-center">
                  <div className="text-token-lg font-semibold text-neutral-800">{s.value}</div>
                  <div className="text-token-xs text-neutral-500 mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Note */}
            <div className="bg-neutral-50 rounded-token-md p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-token-xs font-semibold text-neutral-500 uppercase tracking-wide">
                  {tr('Заметка', 'Eslatma')}
                </span>
                {!editNote && (
                  <Button variant="ghost" size="sm" type="button" onClick={() => setEditNote(true)}>
                    {tr('Изменить', "O'zgartirish")}
                  </Button>
                )}
              </div>
              {editNote ? (
                <div className="flex flex-col gap-1.5">
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    placeholder={tr('Заметка о клиенте…', 'Mijoz haqida eslatma…')}
                    className="w-full rounded-token-md border border-neutral-300 px-3 py-2 text-token-sm text-neutral-800 placeholder:text-neutral-400 bg-white focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500 resize-none"
                  />
                  <div className="flex gap-1.5 justify-end">
                    <Button variant="ghost" size="sm" type="button" onClick={() => { setNote(customer.note || ''); setEditNote(false); }}>
                      {tr('Отмена', 'Bekor')}
                    </Button>
                    <Button variant="primary" size="sm" type="button" onClick={() => void saveNote()} disabled={savingNote}>
                      {savingNote ? '...' : tr('Сохранить', 'Saqlash')}
                    </Button>
                  </div>
                </div>
              ) : (
                <p className={`m-0 text-token-sm ${customer.note ? 'text-neutral-700' : 'text-neutral-400 italic'}`}>
                  {customer.note || tr('Нет заметки', 'Eslatma yo`q')}
                </p>
              )}
            </div>

            {/* Loyalty adjustment */}
            <div className="bg-neutral-50 rounded-token-md p-3">
              <div className="text-token-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">
                {tr('Начислить / списать баллы', 'Ball qo`shish / ayirish')}
              </div>
              <div className="flex gap-1.5 flex-wrap items-start">
                <div className="w-[130px]">
                  <Input
                    type="number"
                    value={loyaltyDelta}
                    onChange={(e) => setLoyaltyDelta(e.target.value)}
                    placeholder={tr('+100 или -50', '+100 yoki -50')}
                  />
                </div>
                <div className="flex-1 min-w-[100px]">
                  <Input
                    type="text"
                    value={loyaltyDesc}
                    onChange={(e) => setLoyaltyDesc(e.target.value)}
                    placeholder={tr('Причина (опц.)', 'Sabab (ixtiyoriy)')}
                  />
                </div>
                <Button
                  variant="primary"
                  size="md"
                  type="button"
                  onClick={() => void submitLoyalty()}
                  disabled={adjustingLoyalty || !loyaltyDelta || parseInt(loyaltyDelta, 10) === 0}
                >
                  {adjustingLoyalty ? '...' : tr('Применить', 'Qo`llash')}
                </Button>
              </div>
              {loyaltyError && <p className="mt-1.5 mb-0 text-token-xs text-danger">{loyaltyError}</p>}
            </div>

            {/* Order history */}
            <div>
              <div className="text-token-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">
                {tr('Последние заказы', 'Oxirgi buyurtmalar')}
              </div>
              {(customer.orders || []).length === 0 ? (
                <p className="text-token-sm text-neutral-400">{tr('Нет заказов', 'Buyurtmalar yo`q')}</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {customer.orders.map((o: any) => (
                    <div key={o.id} className="bg-neutral-50 rounded-token-sm px-3 py-2.5 flex items-center justify-between gap-2">
                      <div>
                        <span className="font-semibold text-token-sm text-neutral-800">#{o.orderNumber}</span>
                        <span className="text-token-xs text-neutral-500 ml-2">
                          {ORDER_STATUS_LABEL[o.status] || o.status}
                        </span>
                        <div className="text-token-xs text-neutral-400 mt-0.5">
                          {new Date(o.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                      <span className="font-semibold text-token-sm text-neutral-800 whitespace-nowrap">
                        {Number(o.total).toLocaleString()} UZS
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Loyalty transaction history */}
            {(customer.loyaltyTxns || []).length > 0 && (
              <div>
                <div className="text-token-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">
                  {tr('История баллов', 'Ballar tarixi')}
                </div>
                <div className="flex flex-col gap-1">
                  {customer.loyaltyTxns.slice(0, 10).map((txn: any) => (
                    <div key={txn.id} className="flex items-center justify-between px-2.5 py-1.5 bg-neutral-50 rounded-token-sm">
                      <span className="text-token-xs text-neutral-600">
                        {txn.description || txn.type}
                      </span>
                      <span className={`text-token-sm font-semibold ${txn.points > 0 ? 'text-success' : 'text-danger'}`}>
                        {txn.points > 0 ? '+' : ''}{txn.points}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </aside>
    </>
  );
}
