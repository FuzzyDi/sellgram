import React, { useEffect, useMemo, useState } from 'react';
import { adminApi } from '../api/store-admin-client';
import { useAdminI18n } from '../i18n';

type StockFilter = 'all' | 'low' | 'out';

export default function Stock() {
  const { tr, locale } = useAdminI18n();
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState<StockFilter>('all');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<{ id: string; variantId?: string } | null>(null);
  const [editQty, setEditQty] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);

  function showNotice(tone: 'success' | 'error', message: string) {
    setNotice({ tone, message });
    setTimeout(() => setNotice(null), 3000);
  }

  async function load() {
    setLoading(true);
    setLoadError(false);
    try {
      const data = await adminApi.getProducts('pageSize=500&includeInactive=true');
      const list = Array.isArray(data?.items ?? data) ? (data?.items ?? data) : [];
      setProducts(list);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  // Flatten products + variants into rows
  const rows = useMemo(() => {
    const result: any[] = [];
    for (const p of products) {
      if (p.variants?.length > 0) {
        for (const v of p.variants) {
          result.push({
            productId: p.id,
            variantId: v.id,
            name: p.name,
            variant: v.name,
            sku: v.sku || p.sku,
            stockQty: v.stockQty,
            lowStockAlert: p.lowStockAlert,
            price: p.price,
            isActive: p.isActive && v.isActive,
          });
        }
      } else {
        result.push({
          productId: p.id,
          variantId: undefined,
          name: p.name,
          variant: null,
          sku: p.sku,
          stockQty: p.stockQty,
          lowStockAlert: p.lowStockAlert,
          price: p.price,
          isActive: p.isActive,
        });
      }
    }
    return result;
  }, [products]);

  const stats = useMemo(() => ({
    total: rows.length,
    low: rows.filter((r) => r.stockQty > 0 && r.stockQty <= r.lowStockAlert).length,
    out: rows.filter((r) => r.stockQty === 0).length,
  }), [rows]);

  const filtered = useMemo(() => {
    let list = rows;
    if (filter === 'low') list = list.filter((r) => r.stockQty > 0 && r.stockQty <= r.lowStockAlert);
    if (filter === 'out') list = list.filter((r) => r.stockQty === 0);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((r) =>
        r.name.toLowerCase().includes(q) ||
        (r.variant && r.variant.toLowerCase().includes(q)) ||
        (r.sku && r.sku.toLowerCase().includes(q))
      );
    }
    return list;
  }, [rows, filter, search]);

  function startEdit(productId: string, variantId: string | undefined, currentQty: number) {
    setEditing({ id: productId, variantId });
    setEditQty(String(currentQty));
  }

  async function saveEdit() {
    if (!editing) return;
    const qty = parseInt(editQty, 10);
    if (isNaN(qty) || qty < 0) {
      showNotice('error', tr('Некорректное количество', 'Noto\'g\'ri miqdor'));
      return;
    }
    setSaving(true);
    try {
      await adminApi.adjustStock(editing.id, qty, editing.variantId);
      setEditing(null);
      await load();
      showNotice('success', tr('Остаток обновлён', 'Qoldiq yangilandi'));
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка сохранения', 'Saqlash xatosi'));
    } finally {
      setSaving(false);
    }
  }

  function stockBadgeStyle(qty: number, low: number) {
    if (qty === 0) return { background: '#fee2e2', color: '#991b1b' };
    if (qty <= low) return { background: '#fef9c3', color: '#854d0e' };
    return { background: '#d1fae5', color: '#065f46' };
  }

  const noticeNode = notice && (
    <div style={{
      position: 'fixed', top: 18, right: 18, zIndex: 70, minWidth: 260,
      borderRadius: 12, padding: '12px 16px', fontSize: 13, fontWeight: 700,
      boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
      color: notice.tone === 'error' ? '#991b1b' : '#065f46',
      background: notice.tone === 'error' ? '#fee2e2' : '#d1fae5',
      border: `1px solid ${notice.tone === 'error' ? '#fecaca' : '#a7f3d0'}`,
    }}>
      {notice.message}
    </div>
  );

  if (loading) {
    return (
      <section className="sg-page sg-grid" style={{ gap: 16 }}>
        <div className="sg-skeleton" style={{ height: 28, width: '30%' }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
          {[1,2,3].map((i) => <div key={i} className="sg-skeleton" style={{ height: 72, borderRadius: 14 }} />)}
        </div>
        <div className="sg-card" style={{ padding: 0 }}>
          {[1,2,3,4,5].map((i) => (
            <div key={i} style={{ display: 'flex', gap: 12, padding: '12px 16px', borderBottom: '1px solid #edf2ee' }}>
              <div className="sg-skeleton" style={{ height: 14, flex: 2 }} />
              <div className="sg-skeleton" style={{ height: 14, flex: 1 }} />
              <div className="sg-skeleton" style={{ height: 14, width: 60 }} />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (loadError) {
    return (
      <section className="sg-page sg-grid" style={{ gap: 16 }}>
        <header><h2 className="sg-title">{tr('Остатки на складе', 'Ombor qoldiqlari')}</h2></header>
        <div className="sg-card" style={{ textAlign: 'center', padding: '32px 16px' }}>
          <p style={{ margin: 0, fontWeight: 700, color: '#be123c' }}>{tr('Не удалось загрузить данные', 'Ma\'lumot yuklanmadi')}</p>
          <button className="sg-btn ghost" style={{ marginTop: 14 }} onClick={load}>{tr('Повторить', 'Qayta urinish')}</button>
        </div>
      </section>
    );
  }

  return (
    <section className="sg-page sg-grid" style={{ gap: 16 }}>
      {noticeNode}

      <header>
        <h2 className="sg-title">{tr('Остатки на складе', 'Ombor qoldiqlari')}</h2>
        <p className="sg-subtitle">{tr('Управление складскими остатками товаров', 'Mahsulotlar ombor qoldiqlarini boshqarish')}</p>
      </header>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
        {[
          { label: tr('Всего позиций', 'Jami pozitsiyalar'), value: stats.total, color: '#1e3a5f' },
          { label: tr('Мало остатков', 'Oz qoldiq'), value: stats.low, color: '#854d0e' },
          { label: tr('Нет в наличии', 'Mavjud emas'), value: stats.out, color: '#991b1b' },
        ].map((kpi) => (
          <div key={kpi.label} className="sg-card" style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#748278', textTransform: 'uppercase', letterSpacing: 0.5 }}>{kpi.label}</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: kpi.color, marginTop: 4 }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="sg-card" style={{ display: 'grid', gap: 10 }}>
        <div className="sg-pill-row">
          {(['all', 'low', 'out'] as StockFilter[]).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`sg-pill${filter === f ? ' active' : ''}`}>
              {f === 'all' ? tr('Все', 'Barchasi') : f === 'low' ? tr('Мало', 'Oz') : tr('Нет в наличии', 'Mavjud emas')}
              {f === 'low' && stats.low > 0 && <span style={{ marginLeft: 4, background: '#854d0e', color: '#fff', borderRadius: 99, padding: '1px 6px', fontSize: 10 }}>{stats.low}</span>}
              {f === 'out' && stats.out > 0 && <span style={{ marginLeft: 4, background: '#991b1b', color: '#fff', borderRadius: 99, padding: '1px 6px', fontSize: 10 }}>{stats.out}</span>}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={tr('Поиск по названию, варианту, артикулу', 'Nom, variant yoki SKU bo\'yicha qidirish')}
          style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '7px 10px', fontSize: 13 }}
        />
      </div>

      {/* Table */}
      <div className="sg-card" style={{ padding: 0, overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <p className="sg-subtitle" style={{ padding: '24px 16px' }}>{tr('Ничего не найдено', 'Hech narsa topilmadi')}</p>
        ) : (
          <table className="sg-table" style={{ margin: 0 }}>
            <thead>
              <tr>
                <th>{tr('Товар', 'Mahsulot')}</th>
                <th>{tr('Артикул', 'Artikul')}</th>
                <th style={{ textAlign: 'right' }}>{tr('Остаток', 'Qoldiq')}</th>
                <th style={{ textAlign: 'right' }}>{tr('Мин. остаток', 'Min. qoldiq')}</th>
                <th style={{ textAlign: 'right' }}>{tr('Цена', 'Narx')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const key = row.variantId ?? row.productId;
                const isEditing = editing?.id === row.productId && editing?.variantId === row.variantId;
                return (
                  <tr key={key}>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{row.name}</div>
                      {row.variant && <div style={{ fontSize: 11, color: '#748278', marginTop: 2 }}>{row.variant}</div>}
                      {!row.isActive && <span style={{ fontSize: 10, color: '#9ca3af' }}> ({tr('неактивен', 'noaktiv')})</span>}
                    </td>
                    <td style={{ fontSize: 12, color: '#748278' }}>{row.sku || '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      {isEditing ? (
                        <input
                          type="number"
                          min={0}
                          value={editQty}
                          onChange={(e) => setEditQty(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(null); }}
                          autoFocus
                          style={{ width: 80, border: '1px solid #2563eb', borderRadius: 6, padding: '4px 8px', fontSize: 13, textAlign: 'right' }}
                        />
                      ) : (
                        <span className="sg-badge" style={stockBadgeStyle(row.stockQty, row.lowStockAlert)}>
                          {row.stockQty}
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', fontSize: 13, color: '#748278' }}>{row.lowStockAlert}</td>
                    <td style={{ textAlign: 'right', fontSize: 13 }}>{Number(row.price).toLocaleString(locale)}</td>
                    <td style={{ textAlign: 'right' }}>
                      {isEditing ? (
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          <button className="sg-btn primary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={saveEdit} disabled={saving}>
                            {tr('Сохранить', 'Saqlash')}
                          </button>
                          <button className="sg-btn ghost" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => setEditing(null)} disabled={saving}>
                            {tr('Отмена', 'Bekor')}
                          </button>
                        </div>
                      ) : (
                        <button
                          className="sg-btn ghost"
                          style={{ fontSize: 12, padding: '4px 10px' }}
                          onClick={() => startEdit(row.productId, row.variantId, row.stockQty)}
                        >
                          {tr('Изменить', 'O\'zgartirish')}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
