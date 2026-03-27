import React, { useEffect, useMemo, useRef, useState } from 'react';
import { adminApi } from '../api/store-admin-client';
import { useAdminI18n } from '../i18n';

const ORDER_STATUS_LABEL: Record<string, string> = {
  NEW: '🆕 Новый', CONFIRMED: '✅ Подтверждён', PREPARING: '👨‍🍳 Готовится',
  READY: '📦 Готов', SHIPPED: '🚚 В пути', DELIVERED: '📬 Доставлен',
  COMPLETED: '🎉 Завершён', CANCELLED: '❌ Отменён', REFUNDED: '↩️ Возврат',
};

function CustomerDrawer({
  customerId, onClose, tr,
}: {
  customerId: string;
  onClose: () => void;
  tr: (ru: string, uz: string) => string;
}) {
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
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 300, animation: 'sg-fade-in 0.15s ease both' }}
      />
      {/* Drawer */}
      <aside style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 480, maxWidth: '95vw',
        background: 'var(--sg-panel, #fff)', zIndex: 301, overflowY: 'auto',
        boxShadow: '-4px 0 32px rgba(0,0,0,0.12)', animation: 'sg-slide-in-right 0.2s ease both',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--sg-border)' }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{tr('Профиль клиента', 'Mijoz profili')}</h2>
          <button onClick={onClose} className="sg-btn ghost" style={{ padding: '4px 10px', fontSize: 18 }}>✕</button>
        </div>

        {loading ? (
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[80, 50, 60, 40].map((w, i) => (
              <div key={i} className="sg-skeleton" style={{ height: 14, width: `${w}%` }} />
            ))}
          </div>
        ) : !customer ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#be123c', fontWeight: 700 }}>
            {tr('Клиент не найден', 'Mijoz topilmadi')}
          </div>
        ) : (
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Avatar + name */}
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%', background: '#00875a', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22, fontWeight: 700, flexShrink: 0,
              }}>
                {((customer.firstName?.[0] || '') + (customer.lastName?.[0] || '')).toUpperCase() || '?'}
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 18 }}>{displayName}</div>
                {customer.telegramUser && (
                  <div style={{ fontSize: 13, color: '#6b7280' }}>@{customer.telegramUser}</div>
                )}
                {customer.phone && (
                  <div style={{ fontSize: 13, color: '#6b7280' }}>{customer.phone}</div>
                )}
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                  {tr('С нами с', 'Biz bilan')}: {new Date(customer.createdAt).toLocaleDateString()}
                </div>
              </div>
            </div>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {[
                { label: tr('Заказов', 'Buyurtmalar'), value: customer.ordersCount ?? 0 },
                { label: tr('Потрачено', 'Sarflagan'), value: `${Number(customer.totalSpent ?? 0).toLocaleString()} UZS` },
                { label: tr('Баллы', 'Ballar'), value: customer.loyaltyPoints ?? 0 },
              ].map((s) => (
                <div key={s.label} style={{ background: 'var(--sg-panel-2, #f9fafb)', borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
                  <div style={{ fontSize: 17, fontWeight: 800 }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Note */}
            <div style={{ background: 'var(--sg-panel-2, #f9fafb)', borderRadius: 10, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {tr('Заметка', 'Eslatma')}
                </span>
                {!editNote && (
                  <button className="sg-btn ghost" style={{ fontSize: 12, padding: '2px 8px' }} onClick={() => setEditNote(true)}>
                    {tr('Изменить', "O'zgartirish")}
                  </button>
                )}
              </div>
              {editNote ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    placeholder={tr('Заметка о клиенте…', 'Mijoz haqida eslatma…')}
                    style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '7px 10px', fontSize: 13, resize: 'none' }}
                  />
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button className="sg-btn ghost" onClick={() => { setNote(customer.note || ''); setEditNote(false); }}>
                      {tr('Отмена', 'Bekor')}
                    </button>
                    <button className="sg-btn primary" onClick={() => void saveNote()} disabled={savingNote}>
                      {savingNote ? '...' : tr('Сохранить', 'Saqlash')}
                    </button>
                  </div>
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: 13, color: customer.note ? '#374151' : '#9ca3af', fontStyle: customer.note ? 'normal' : 'italic' }}>
                  {customer.note || tr('Нет заметки', 'Eslatma yo`q')}
                </p>
              )}
            </div>

            {/* Loyalty adjustment */}
            <div style={{ background: 'var(--sg-panel-2, #f9fafb)', borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                {tr('Начислить / списать баллы', 'Ball qo`shish / ayirish')}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <input
                  type="number"
                  value={loyaltyDelta}
                  onChange={(e) => setLoyaltyDelta(e.target.value)}
                  placeholder={tr('+100 или -50', '+100 yoki -50')}
                  style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '7px 10px', fontSize: 13, width: 130 }}
                />
                <input
                  type="text"
                  value={loyaltyDesc}
                  onChange={(e) => setLoyaltyDesc(e.target.value)}
                  placeholder={tr('Причина (опц.)', 'Sabab (ixtiyoriy)')}
                  style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '7px 10px', fontSize: 13, flex: 1, minWidth: 100 }}
                />
                <button
                  className="sg-btn primary"
                  onClick={() => void submitLoyalty()}
                  disabled={adjustingLoyalty || !loyaltyDelta || parseInt(loyaltyDelta, 10) === 0}
                >
                  {adjustingLoyalty ? '...' : tr('Применить', 'Qo`llash')}
                </button>
              </div>
              {loyaltyError && <p style={{ margin: '6px 0 0', fontSize: 12, color: '#be123c' }}>{loyaltyError}</p>}
            </div>

            {/* Order history */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                {tr('Последние заказы', 'Oxirgi buyurtmalar')}
              </div>
              {(customer.orders || []).length === 0 ? (
                <p style={{ fontSize: 13, color: '#9ca3af' }}>{tr('Нет заказов', 'Buyurtmalar yo`q')}</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {customer.orders.map((o: any) => (
                    <div key={o.id} style={{
                      background: 'var(--sg-panel-2, #f9fafb)', borderRadius: 8, padding: '10px 12px',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                    }}>
                      <div>
                        <span style={{ fontWeight: 700, fontSize: 13 }}>#{o.orderNumber}</span>
                        <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 8 }}>
                          {ORDER_STATUS_LABEL[o.status] || o.status}
                        </span>
                        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                          {new Date(o.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                      <span style={{ fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap' }}>
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
                <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                  {tr('История баллов', 'Ballar tarixi')}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {customer.loyaltyTxns.slice(0, 10).map((txn: any) => (
                    <div key={txn.id} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '6px 10px', background: 'var(--sg-panel-2, #f9fafb)', borderRadius: 6,
                    }}>
                      <span style={{ fontSize: 12, color: '#374151' }}>
                        {txn.description || txn.type}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: txn.points > 0 ? '#059669' : '#be123c' }}>
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

export default function Customers() {
  const { tr } = useAdminI18n();
  const [data, setData] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function handleExport() {
    setExporting(true);
    try { await adminApi.downloadCustomersCsv(); } catch { /* ignore */ } finally { setExporting(false); }
  }

  const handleSearch = (value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(1);
    }, 300);
  };

  useEffect(() => {
    setLoading(true);
    setError(false);
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('pageSize', '30');
    if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());

    adminApi
      .getCustomers(params.toString())
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [page, debouncedSearch]);

  const totalPages = useMemo(() => Math.max(1, data?.totalPages || 1), [data?.totalPages]);

  if (error) {
    return (
      <section className="sg-page sg-grid" style={{ gap: 16 }}>
        <header>
          <h2 className="sg-title">{tr('Клиенты', 'Mijozlar')}</h2>
        </header>
        <div className="sg-card" style={{ textAlign: 'center', padding: '32px 16px' }}>
          <p style={{ margin: 0, fontWeight: 700, color: '#be123c' }}>{tr('Не удалось загрузить клиентов', "Mijozlarni yuklab bo'lmadi")}</p>
          <button className="sg-btn ghost" style={{ marginTop: 14 }} onClick={() => { setPage(1); setError(false); setLoading(true); }}>
            {tr('Повторить', 'Qayta urinish')}
          </button>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="sg-page sg-grid" style={{ gap: 16 }}>
        <header>
          <h2 className="sg-title">{tr('Клиенты', 'Mijozlar')}</h2>
          <p className="sg-subtitle">{tr('Сводка по базе клиентов вашего магазина', "Do'koningiz mijozlari bo'yicha umumiy ko'rinish")}</p>
        </header>

        <div className="sg-card" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder={tr('Поиск: имя, @username, телефон', 'Qidiruv: ism, @username, telefon')}
            style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '7px 10px', fontSize: 13, minWidth: 280, flex: 1 }}
          />
          <button
            className="sg-btn ghost"
            onClick={() => void handleExport()}
            disabled={exporting}
            title={tr('Экспорт до 10 000 клиентов. Лимит: 5 выгрузок в минуту.', "Maksimal 10 000 mijoz. Limit: daqiqada 5 ta yuklab olish.")}
          >
            {exporting ? '⏳' : '⬇️'} CSV
          </button>
        </div>

        {loading ? (
          <div className="sg-card" style={{ padding: 0, overflow: 'hidden' }}>
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} style={{ display: 'flex', gap: 16, padding: '12px 16px', borderBottom: '1px solid #edf2ee', alignItems: 'center' }}>
                <div style={{ flex: 2, display: 'grid', gap: 6 }}>
                  <div className="sg-skeleton" style={{ height: 14, width: '50%' }} />
                  <div className="sg-skeleton" style={{ height: 11, width: '30%' }} />
                </div>
                <div className="sg-skeleton" style={{ height: 14, width: 80 }} />
                <div className="sg-skeleton" style={{ height: 14, width: 40 }} />
                <div className="sg-skeleton" style={{ height: 14, width: 80 }} />
                <div className="sg-skeleton" style={{ height: 14, width: 40 }} />
              </div>
            ))}
          </div>
        ) : (
          <div className="sg-card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="sg-table">
              <thead>
                <tr>
                  <th>{tr('Клиент', 'Mijoz')}</th>
                  <th>Telegram</th>
                  <th>{tr('Заказов', 'Buyurtmalar')}</th>
                  <th>{tr('Потрачено', 'Sarflangan')}</th>
                  <th>{tr('Баллы', 'Ballar')}</th>
                </tr>
              </thead>
              <tbody>
                {data?.items?.map((customer: any) => (
                  <tr
                    key={customer.id}
                    onClick={() => setSelectedId(customer.id)}
                    style={{ cursor: 'pointer' }}
                    className="sg-tr-hover"
                  >
                    <td>
                      <div style={{ fontWeight: 700 }}>{[customer.firstName, customer.lastName].filter(Boolean).join(' ') || '-'}</div>
                      {customer.phone && <div style={{ fontSize: 12, color: '#6c7b72' }}>{customer.phone}</div>}
                    </td>
                    <td>{customer.telegramUser ? `@${customer.telegramUser}` : customer.telegramId || '-'}</td>
                    <td>{customer.ordersCount || 0}</td>
                    <td style={{ fontWeight: 700 }}>{Number(customer.totalSpent || 0).toLocaleString()} UZS</td>
                    <td>{customer.loyaltyPoints || 0}</td>
                  </tr>
                ))}
                {(data?.items || []).length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', color: '#6b7a71' }}>
                      {tr('Пока нет клиентов', "Hozircha mijozlar yo'q")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <div style={{ padding: '12px 14px', borderTop: '1px solid #edf2ee', color: '#5f6d64', fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span>
                {tr('Всего клиентов', 'Jami mijozlar')}: {data?.total || 0}
              </span>
              <span>
                {tr('Страница', 'Sahifa')} {data?.page || page} / {totalPages}
              </span>
            </div>
            <div style={{ padding: '0 14px 12px', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="sg-btn ghost" disabled={(data?.page || page) <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                {tr('Назад', 'Orqaga')}
              </button>
              <button className="sg-btn ghost" disabled={(data?.page || page) >= totalPages} onClick={() => setPage((p) => p + 1)}>
                {tr('Далее', 'Keyingi')}
              </button>
            </div>
          </div>
        )}
      </section>

      {selectedId && (
        <CustomerDrawer
          customerId={selectedId}
          onClose={() => setSelectedId(null)}
          tr={tr}
        />
      )}
    </>
  );
}
