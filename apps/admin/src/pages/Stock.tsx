import React, { useEffect, useMemo, useState } from 'react';
import { adminApi } from '../api/store-admin-client';
import { useAdminI18n } from '../i18n';

type StockFilter = 'all' | 'low' | 'out';
type AdjustMode = 'set' | 'add' | 'sub';
type SortField = 'name' | 'qty' | null;
type SortDir = 'asc' | 'desc';

export default function Stock() {
  const { tr, locale } = useAdminI18n();
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState<StockFilter>('all');
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('qty');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Stock edit state
  const [editing, setEditing] = useState<{ id: string; variantId?: string } | null>(null);
  const [editQty, setEditQty] = useState('');
  const [editMode, setEditMode] = useState<AdjustMode>('set');
  const [editNote, setEditNote] = useState('');
  const [saving, setSaving] = useState(false);

  // LowStockAlert inline edit
  const [editingAlert, setEditingAlert] = useState<string | null>(null); // productId
  const [editAlertVal, setEditAlertVal] = useState('');

  // Movement log
  const [showLog, setShowLog] = useState(false);
  const [movements, setMovements] = useState<any[]>([]);
  const [movementsLoading, setMovementsLoading] = useState(false);
  const [logProductFilter, setLogProductFilter] = useState<{ id: string; name: string } | null>(null);

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

  async function loadMovements(productId?: string) {
    setMovementsLoading(true);
    try {
      const params = new URLSearchParams({ limit: '200' });
      if (productId) params.set('productId', productId);
      const data = await adminApi.getStockMovements(params.toString());
      setMovements(Array.isArray(data) ? data : []);
    } catch {
      setMovements([]);
    } finally {
      setMovementsLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    if (showLog) void loadMovements(logProductFilter?.id);
  }, [showLog]);

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
    if (sortField) {
      list = [...list].sort((a, b) => {
        const av = sortField === 'qty' ? a.stockQty : a.name.toLowerCase();
        const bv = sortField === 'qty' ? b.stockQty : b.name.toLowerCase();
        if (av < bv) return sortDir === 'asc' ? -1 : 1;
        if (av > bv) return sortDir === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return list;
  }, [rows, filter, search, sortField, sortDir]);

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  }

  function startEdit(productId: string, variantId: string | undefined, currentQty: number) {
    setEditing({ id: productId, variantId });
    setEditQty(String(currentQty));
    setEditMode('set');
    setEditNote('');
  }

  async function saveEdit() {
    if (!editing) return;
    const qty = parseInt(editQty, 10);
    if (isNaN(qty)) { showNotice('error', tr('Некорректное количество', 'Noto\'g\'ri miqdor')); return; }
    if (editMode === 'set' && qty < 0) { showNotice('error', tr('Значение не может быть отрицательным', 'Qiymat manfiy bo\'lishi mumkin emas')); return; }
    setSaving(true);
    try {
      const apiMode = editMode === 'set' ? 'set' : 'delta';
      const apiQty = editMode === 'sub' ? -qty : qty;
      await adminApi.adjustStock(editing.id, apiQty, {
        variantId: editing.variantId,
        mode: apiMode,
        note: editNote.trim() || undefined,
      });
      setEditing(null);
      await load();
      if (showLog) await loadMovements();
      showNotice('success', tr('Остаток обновлён', 'Qoldiq yangilandi'));
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка сохранения', 'Saqlash xatosi'));
    } finally {
      setSaving(false);
    }
  }

  async function saveAlert(productId: string) {
    const val = parseInt(editAlertVal, 10);
    if (isNaN(val) || val < 0) { showNotice('error', tr('Некорректное значение', 'Noto\'g\'ri qiymat')); return; }
    try {
      await adminApi.updateProduct(productId, { lowStockAlert: val });
      setEditingAlert(null);
      await load();
      showNotice('success', tr('Порог обновлён', 'Chegara yangilandi'));
    } catch (err: any) {
      showNotice('error', err?.message || tr('Ошибка', 'Xatolik'));
    }
  }

  function variantNameForMovement(m: any): string | null {
    if (!m.variantId) return null;
    const product = products.find((p: any) => p.id === m.productId);
    const variant = product?.variants?.find((v: any) => v.id === m.variantId);
    return variant?.name ?? null;
  }

  function openLogForProduct(productId: string, productName: string) {
    setLogProductFilter({ id: productId, name: productName });
    setMovements([]);
    setShowLog(true);
    void loadMovements(productId);
  }

  function clearLogFilter() {
    setLogProductFilter(null);
    setMovements([]);
    void loadMovements();
  }

  function stockBadgeStyle(qty: number, low: number) {
    if (qty === 0) return { background: '#fee2e2', color: '#991b1b' };
    if (qty <= low) return { background: '#fef9c3', color: '#854d0e' };
    return { background: '#d1fae5', color: '#065f46' };
  }

  function sortIcon(field: SortField) {
    if (sortField !== field) return <span style={{ opacity: 0.3 }}>↕</span>;
    return <span>{sortDir === 'asc' ? '↑' : '↓'}</span>;
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

      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 className="sg-title">{tr('Остатки на складе', 'Ombor qoldiqlari')}</h2>
          <p className="sg-subtitle">{tr('Управление складскими остатками товаров', 'Mahsulotlar ombor qoldiqlarini boshqarish')}</p>
        </div>
        <button
          className={`sg-btn${showLog ? ' primary' : ' ghost'}`}
          style={{ fontSize: 13 }}
          onClick={() => {
            if (showLog) {
              setShowLog(false);
              setLogProductFilter(null);
            } else {
              setLogProductFilter(null);
              setMovements([]);
              setShowLog(true);
            }
          }}
        >
          {tr('Журнал движений', 'Harakatlar jurnali')}
        </button>
      </header>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
        {[
          { label: tr('Всего позиций', 'Jami pozitsiyalar'), value: stats.total, color: '#1e3a5f' },
          { label: tr('Мало остатков', 'Oz qoldiq'), value: stats.low, color: '#854d0e' },
          { label: tr('Нет в наличии', 'Mavjud emas'), value: stats.out, color: '#991b1b' },
        ].map((kpi) => (
          <div key={kpi.label} className="sg-card" style={{ padding: '14px 16px', cursor: kpi.value > 0 ? 'pointer' : 'default' }}
            onClick={() => {
              if (kpi.color === '#854d0e') setFilter('low');
              else if (kpi.color === '#991b1b') setFilter('out');
            }}>
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
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('name')}>
                  {tr('Товар', 'Mahsulot')} {sortIcon('name')}
                </th>
                <th>{tr('Артикул', 'Artikul')}</th>
                <th style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('qty')}>
                  {tr('Остаток', 'Qoldiq')} {sortIcon('qty')}
                </th>
                <th style={{ textAlign: 'right' }}>{tr('Мин. остаток', 'Min. qoldiq')}</th>
                <th style={{ textAlign: 'right' }}>{tr('Цена', 'Narx')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const key = row.variantId ?? row.productId;
                const isEditing = editing?.id === row.productId && editing?.variantId === row.variantId;
                const isEditingAlert = editingAlert === row.productId && !row.variantId;
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
                        <div style={{ display: 'grid', gap: 6, minWidth: 180 }}>
                          {/* Mode selector */}
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                            {(['set', 'add', 'sub'] as AdjustMode[]).map((m) => (
                              <button
                                key={m}
                                onClick={() => setEditMode(m)}
                                className={`sg-btn${editMode === m ? ' primary' : ' ghost'}`}
                                style={{ fontSize: 11, padding: '2px 8px' }}
                              >
                                {m === 'set' ? tr('Задать', 'Belgilash') : m === 'add' ? '+ Приход' : '− Списание'}
                              </button>
                            ))}
                          </div>
                          <input
                            type="number"
                            min={0}
                            value={editQty}
                            onChange={(e) => setEditQty(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(null); }}
                            autoFocus
                            placeholder={editMode === 'set' ? tr('Новый остаток', 'Yangi qoldiq') : tr('Количество', 'Miqdor')}
                            style={{ width: '100%', border: '1px solid #2563eb', borderRadius: 6, padding: '4px 8px', fontSize: 13, textAlign: 'right', boxSizing: 'border-box' }}
                          />
                          <input
                            value={editNote}
                            onChange={(e) => setEditNote(e.target.value)}
                            placeholder={tr('Причина (необязательно)', 'Sabab (ixtiyoriy)')}
                            style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 6, padding: '4px 8px', fontSize: 12, boxSizing: 'border-box' }}
                          />
                        </div>
                      ) : (
                        <span className="sg-badge" style={stockBadgeStyle(row.stockQty, row.lowStockAlert)}>
                          {row.stockQty}
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', fontSize: 13, color: '#748278' }}>
                      {isEditingAlert ? (
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', alignItems: 'center' }}>
                          <input
                            type="number" min={0} value={editAlertVal}
                            onChange={(e) => setEditAlertVal(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') saveAlert(row.productId); if (e.key === 'Escape') setEditingAlert(null); }}
                            autoFocus
                            style={{ width: 60, border: '1px solid #2563eb', borderRadius: 6, padding: '3px 6px', fontSize: 12, textAlign: 'right' }}
                          />
                          <button className="sg-btn primary" style={{ fontSize: 11, padding: '3px 6px' }} onClick={() => saveAlert(row.productId)}>✓</button>
                          <button className="sg-btn ghost" style={{ fontSize: 11, padding: '3px 6px' }} onClick={() => setEditingAlert(null)}>✕</button>
                        </div>
                      ) : (
                        <span
                          title={tr('Нажмите, чтобы изменить', 'O\'zgartirish uchun bosing')}
                          onClick={() => { if (!row.variantId) { setEditingAlert(row.productId); setEditAlertVal(String(row.lowStockAlert)); } }}
                          style={{ cursor: row.variantId ? 'default' : 'pointer', borderBottom: row.variantId ? 'none' : '1px dashed #9ca3af' }}
                        >
                          {row.lowStockAlert}
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', fontSize: 13 }}>{Number(row.price).toLocaleString(locale)}</td>
                    <td style={{ textAlign: 'right' }}>
                      {isEditing ? (
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', marginTop: 4 }}>
                          <button className="sg-btn primary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={saveEdit} disabled={saving}>
                            {tr('Сохранить', 'Saqlash')}
                          </button>
                          <button className="sg-btn ghost" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => setEditing(null)} disabled={saving}>
                            {tr('Отмена', 'Bekor')}
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          <button
                            className="sg-btn ghost"
                            style={{ fontSize: 12, padding: '4px 10px' }}
                            onClick={() => startEdit(row.productId, row.variantId, row.stockQty)}
                          >
                            {tr('Изменить', 'O\'zgartirish')}
                          </button>
                          <button
                            className="sg-btn ghost"
                            style={{ fontSize: 12, padding: '4px 8px', color: '#2563eb' }}
                            title={tr('История движений', 'Harakatlar tarixi')}
                            onClick={() => openLogForProduct(row.productId, row.name)}
                          >
                            ↕
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Movement log */}
      {showLog && (
        <div className="sg-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #edf2ee', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap' }}>
                {tr('Журнал движений', 'Harakatlar jurnali')}
              </h3>
              {logProductFilter && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#eff6ff', borderRadius: 8, padding: '3px 10px', fontSize: 12, color: '#1d4ed8', fontWeight: 600, minWidth: 0 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
                    {logProductFilter.name}
                  </span>
                  <button
                    onClick={clearLogFilter}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1d4ed8', padding: 0, lineHeight: 1, fontSize: 14 }}
                    title={tr('Показать все', 'Hammasini ko\'rsatish')}
                  >
                    ×
                  </button>
                </div>
              )}
            </div>
            <button className="sg-btn ghost" style={{ fontSize: 12, flexShrink: 0 }} onClick={() => loadMovements(logProductFilter?.id)} disabled={movementsLoading}>
              {movementsLoading ? tr('Загрузка...', 'Yuklanmoqda...') : tr('Обновить', 'Yangilash')}
            </button>
          </div>
          {movementsLoading ? (
            <div style={{ padding: 16 }}>
              {[1,2,3].map((i) => <div key={i} className="sg-skeleton" style={{ height: 36, marginBottom: 8 }} />)}
            </div>
          ) : movements.length === 0 ? (
            <p className="sg-subtitle" style={{ padding: '20px 16px' }}>{tr('Движений пока нет', 'Hali harakatlar yo\'q')}</p>
          ) : (
            <table className="sg-table" style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th>{tr('Дата', 'Sana')}</th>
                  <th>{tr('Товар', 'Mahsulot')}</th>
                  <th style={{ textAlign: 'right' }}>{tr('Изменение', 'O\'zgarish')}</th>
                  <th style={{ textAlign: 'right' }}>{tr('Было → Стало', 'Oldin → Keyin')}</th>
                  <th>{tr('Причина', 'Sabab')}</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m: any) => {
                  const variantName = variantNameForMovement(m);
                  return (
                    <tr key={m.id}>
                      <td style={{ fontSize: 12, color: '#748278', whiteSpace: 'nowrap' }}>
                        {new Date(m.createdAt).toLocaleString(locale)}
                      </td>
                      <td style={{ fontSize: 13 }}>
                        <div>{m.product?.name ?? '—'}</div>
                        {variantName && <div style={{ fontSize: 11, color: '#748278', marginTop: 1 }}>{variantName}</div>}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: m.delta > 0 ? '#065f46' : m.delta < 0 ? '#991b1b' : '#748278' }}>
                        {m.delta > 0 ? `+${m.delta}` : m.delta}
                      </td>
                      <td style={{ textAlign: 'right', fontSize: 12, color: '#748278' }}>
                        {m.qtyBefore} → {m.qtyAfter}
                      </td>
                      <td style={{ fontSize: 12, color: '#748278' }}>{m.note || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
}
