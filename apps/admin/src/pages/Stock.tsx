import React, { useEffect, useMemo, useState } from 'react';
import { adminApi } from '../api/store-admin-client';
import { useAdminI18n } from '../i18n';
import Card from '../components/Card';
import Button from '../components/Button';
import Input from '../components/Input';
import Badge from '../components/Badge';
import Table, { type TableColumn } from '../components/Table';
import StockMovementsLog from './stock/StockMovementsLog';

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

  function stockBadgeVariant(qty: number, low: number): 'danger' | 'warning' | 'success' {
    if (qty === 0) return 'danger';
    if (qty <= low) return 'warning';
    return 'success';
  }

  const noticeNode = notice && (
    <div className={[
      'fixed top-[18px] right-[18px] z-[70] min-w-[260px] rounded-token-lg px-4 py-3 text-token-sm font-semibold shadow-sm border',
      notice.tone === 'error' ? 'bg-danger/10 text-danger border-danger/30' : 'bg-success/10 text-success border-success/30',
    ].join(' ')}>
      {notice.message}
    </div>
  );

  if (loading) {
    return (
      <section className="flex flex-col gap-4">
        <div className="h-7 w-[30%] rounded-token-sm bg-neutral-100 animate-pulse" />
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-[72px] rounded-token-lg bg-neutral-100 animate-pulse" />)}
        </div>
        <Card style={{ padding: 0 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex gap-3 px-4 py-3 border-b border-neutral-100 last:border-0">
              <div className="h-3.5 flex-[2] rounded-token-sm bg-neutral-100 animate-pulse" />
              <div className="h-3.5 flex-1 rounded-token-sm bg-neutral-100 animate-pulse" />
              <div className="h-3.5 w-[60px] rounded-token-sm bg-neutral-100 animate-pulse" />
            </div>
          ))}
        </Card>
      </section>
    );
  }

  if (loadError) {
    return (
      <section className="flex flex-col gap-4">
        <header><h2 className="text-token-2xl font-semibold text-neutral-800">{tr('Остатки на складе', 'Ombor qoldiqlari')}</h2></header>
        <Card className="text-center py-8 px-4">
          <p className="m-0 font-semibold text-danger">{tr('Не удалось загрузить данные', 'Ma\'lumot yuklanmadi')}</p>
          <Button variant="ghost" size="md" type="button" className="mt-3.5" onClick={load}>{tr('Повторить', 'Qayta urinish')}</Button>
        </Card>
      </section>
    );
  }

  const columns: TableColumn<typeof filtered[number]>[] = [
    {
      key: 'name',
      header: tr('Товар', 'Mahsulot'),
      sortable: true,
      render: (row) => (
        <div>
          <div className="font-semibold text-token-sm text-neutral-800">{row.name}</div>
          {row.variant && <div className="text-token-xs text-neutral-500 mt-0.5">{row.variant}</div>}
          {!row.isActive && <span className="text-token-xs text-neutral-400"> ({tr('неактивен', 'noaktiv')})</span>}
        </div>
      ),
    },
    {
      key: 'sku',
      header: tr('Артикул', 'Artikul'),
      render: (row) => <span className="text-token-xs text-neutral-500">{row.sku || '—'}</span>,
    },
    {
      key: 'qty',
      header: tr('Остаток', 'Qoldiq'),
      sortable: true,
      align: 'right',
      render: (row) => {
        const isEditing = editing?.id === row.productId && editing?.variantId === row.variantId;
        if (!isEditing) {
          return <Badge variant={stockBadgeVariant(row.stockQty, row.lowStockAlert)}>{row.stockQty}</Badge>;
        }
        return (
          <div className="flex flex-col gap-1.5 min-w-[180px]">
            <div className="flex gap-1 justify-end">
              {(['set', 'add', 'sub'] as AdjustMode[]).map((m) => (
                <Button
                  key={m}
                  type="button"
                  variant={editMode === m ? 'primary' : 'ghost'}
                  size="sm"
                  onClick={() => setEditMode(m)}
                >
                  {m === 'set' ? tr('Задать', 'Belgilash') : m === 'add' ? '+ Приход' : '− Списание'}
                </Button>
              ))}
            </div>
            <Input
              type="number"
              min={0}
              value={editQty}
              onChange={(e) => setEditQty(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(null); }}
              autoFocus
              placeholder={editMode === 'set' ? tr('Новый остаток', 'Yangi qoldiq') : tr('Количество', 'Miqdor')}
              className="text-right"
            />
            <Input
              value={editNote}
              onChange={(e) => setEditNote(e.target.value)}
              placeholder={tr('Причина (необязательно)', 'Sabab (ixtiyoriy)')}
            />
          </div>
        );
      },
    },
    {
      key: 'lowStockAlert',
      header: tr('Мин. остаток', 'Min. qoldiq'),
      align: 'right',
      render: (row) => {
        const isEditingAlert = editingAlert === row.productId && !row.variantId;
        if (isEditingAlert) {
          return (
            <div className="flex gap-1 justify-end items-center">
              <div className="w-16">
                <Input
                  type="number"
                  min={0}
                  value={editAlertVal}
                  onChange={(e) => setEditAlertVal(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveAlert(row.productId); if (e.key === 'Escape') setEditingAlert(null); }}
                  autoFocus
                  className="text-right"
                />
              </div>
              <Button variant="primary" size="sm" type="button" onClick={() => saveAlert(row.productId)}>✓</Button>
              <Button variant="ghost" size="sm" type="button" onClick={() => setEditingAlert(null)}>✕</Button>
            </div>
          );
        }
        return (
          <span
            title={tr('Нажмите, чтобы изменить', 'O\'zgartirish uchun bosing')}
            onClick={() => { if (!row.variantId) { setEditingAlert(row.productId); setEditAlertVal(String(row.lowStockAlert)); } }}
            className={`text-token-sm text-neutral-500 ${row.variantId ? 'cursor-default' : 'cursor-pointer border-b border-dashed border-neutral-400'}`}
          >
            {row.lowStockAlert}
          </span>
        );
      },
    },
    {
      key: 'price',
      header: tr('Цена', 'Narx'),
      align: 'right',
      render: (row) => <span className="text-token-sm text-neutral-700">{Number(row.price).toLocaleString(locale)}</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => {
        const isEditing = editing?.id === row.productId && editing?.variantId === row.variantId;
        if (isEditing) {
          return (
            <div className="flex gap-1 justify-end">
              <Button variant="primary" size="sm" type="button" onClick={saveEdit} disabled={saving}>
                {tr('Сохранить', 'Saqlash')}
              </Button>
              <Button variant="ghost" size="sm" type="button" onClick={() => setEditing(null)} disabled={saving}>
                {tr('Отмена', 'Bekor')}
              </Button>
            </div>
          );
        }
        return (
          <div className="flex gap-1 justify-end">
            <Button variant="ghost" size="sm" type="button" onClick={() => startEdit(row.productId, row.variantId, row.stockQty)}>
              {tr('Изменить', 'O\'zgartirish')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              title={tr('История движений', 'Harakatlar tarixi')}
              onClick={() => openLogForProduct(row.productId, row.name)}
            >
              <span className="text-accent-600">↕</span>
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <section className="flex flex-col gap-4">
      {noticeNode}

      <header className="flex justify-between items-start">
        <div>
          <h2 className="text-token-2xl font-semibold text-neutral-800">{tr('Остатки на складе', 'Ombor qoldiqlari')}</h2>
          <p className="mt-1 text-token-sm text-neutral-500">{tr('Управление складскими остатками товаров', 'Mahsulotlar ombor qoldiqlarini boshqarish')}</p>
        </div>
        <Button
          type="button"
          variant={showLog ? 'primary' : 'ghost'}
          size="md"
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
        </Button>
      </header>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: tr('Всего позиций', 'Jami pozitsiyalar'), value: stats.total, kind: 'total' as const },
          { label: tr('Мало остатков', 'Oz qoldiq'), value: stats.low, kind: 'low' as const },
          { label: tr('Нет в наличии', 'Mavjud emas'), value: stats.out, kind: 'out' as const },
        ].map((kpi) => (
          <Card
            key={kpi.label}
            className={kpi.value > 0 ? 'cursor-pointer' : ''}
            onClick={() => {
              if (kpi.kind === 'low') setFilter('low');
              else if (kpi.kind === 'out') setFilter('out');
            }}
          >
            <div className="text-token-xs font-semibold text-neutral-500 uppercase tracking-wide">{kpi.label}</div>
            <div className={[
              'text-token-2xl font-bold mt-1',
              kpi.kind === 'low' ? 'text-warning' : kpi.kind === 'out' ? 'text-danger' : 'text-neutral-800',
            ].join(' ')}>
              {kpi.value}
            </div>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card className="flex flex-col gap-2.5">
        <div className="flex flex-wrap gap-2">
          {(['all', 'low', 'out'] as StockFilter[]).map((f) => (
            <Button key={f} type="button" variant={filter === f ? 'primary' : 'secondary'} size="sm" onClick={() => setFilter(f)}>
              {f === 'all' ? tr('Все', 'Barchasi') : f === 'low' ? tr('Мало', 'Oz') : tr('Нет в наличии', 'Mavjud emas')}
              {f === 'low' && stats.low > 0 && <span className="ml-1.5">({stats.low})</span>}
              {f === 'out' && stats.out > 0 && <span className="ml-1.5">({stats.out})</span>}
            </Button>
          ))}
        </div>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={tr('Поиск по названию, варианту, артикулу', 'Nom, variant yoki SKU bo\'yicha qidirish')}
        />
      </Card>

      {/* Table */}
      <Table
        columns={columns}
        data={filtered}
        rowKey={(row) => row.variantId ?? row.productId}
        emptyMessage={tr('Ничего не найдено', 'Hech narsa topilmadi')}
        sortKey={sortField ?? undefined}
        sortDirection={sortDir}
        onSort={(key) => toggleSort(key as SortField)}
      />

      {/* Movement log */}
      {showLog && (
        <StockMovementsLog
          movements={movements}
          movementsLoading={movementsLoading}
          logProductFilter={logProductFilter}
          onRefresh={() => loadMovements(logProductFilter?.id)}
          onClearFilter={clearLogFilter}
          variantNameForMovement={variantNameForMovement}
          locale={locale}
        />
      )}
    </section>
  );
}
