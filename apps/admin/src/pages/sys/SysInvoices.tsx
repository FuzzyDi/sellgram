import React, { useEffect, useState } from 'react';
import { systemApi } from '../../api/system-admin-client';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Input from '../../components/Input';
import Select from '../../components/Select';
import Badge, { BadgeVariant } from '../../components/Badge';
import Table, { TableColumn } from '../../components/Table';

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  PENDING: 'warning',
  PAID: 'success',
  CANCELLED: 'danger',
  EXPIRED: 'neutral',
};

function StatusBadge({ status }: { status: string }) {
  return <Badge variant={STATUS_VARIANTS[status] || 'neutral'}>{status}</Badge>;
}

export default function SysInvoices() {
  const [pending, setPending] = useState<any[]>([]);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [moderating, setModerating] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState({ tenantId: '', plan: 'PRO', amount: '', paymentRef: '', autoConfirm: false });
  const [submitting, setSubmitting] = useState(false);
  const [tenants, setTenants] = useState<any[]>([]);

  function showNotice(msg: string) { setNotice(msg); setTimeout(() => setNotice(''), 3000); }

  function loadAll() {
    const params = new URLSearchParams({ page: String(page), pageSize: '30' });
    if (statusFilter) params.set('status', statusFilter);
    if (search.trim()) params.set('search', search.trim());
    Promise.allSettled([
      systemApi.pendingInvoices().then(setPending),
      systemApi.invoices(params.toString()).then(setData),
    ]).finally(() => setLoading(false));
  }

  useEffect(() => { setLoading(true); loadAll(); }, [page, statusFilter, search]);

  useEffect(() => {
    systemApi.tenants('pageSize=200').then((d) => setTenants(d?.items || d || [])).catch(() => showNotice('❌ Не удалось загрузить список тенантов'));
  }, []);

  async function moderate(id: string, action: 'confirm' | 'reject') {
    setModerating(id);
    try {
      if (action === 'confirm') await systemApi.confirmInvoice(id);
      else await systemApi.rejectInvoice(id);
      showNotice(action === 'confirm' ? '✅ Подтверждён' : '✅ Отклонён');
      loadAll();
    } catch (e: any) { showNotice('❌ ' + e.message); }
    finally { setModerating(null); }
  }

  async function submitCreate() {
    if (!createForm.tenantId || !createForm.amount) return;
    setSubmitting(true);
    try {
      await systemApi.createInvoice({ tenantId: createForm.tenantId, plan: createForm.plan, amount: Number(createForm.amount), paymentRef: createForm.paymentRef || undefined, autoConfirm: createForm.autoConfirm });
      showNotice('✅ Инвойс создан');
      setShowCreateForm(false);
      setCreateForm({ tenantId: '', plan: 'PRO', amount: '', paymentRef: '', autoConfirm: false });
      loadAll();
    } catch (e: any) { showNotice('❌ ' + e.message); }
    finally { setSubmitting(false); }
  }

  const items: any[] = data?.items || [];
  const totalPages = data?.totalPages || 1;

  const columns: TableColumn<any>[] = [
    { key: 'tenant', header: 'Тенант', render: (inv) => <span className="font-semibold">{inv.tenant?.name || inv.tenantId?.slice(0, 12)}</span> },
    { key: 'plan', header: 'План', render: (inv) => inv.plan },
    { key: 'amount', header: 'Сумма', render: (inv) => <span className="font-bold">{Number(inv.amount).toLocaleString()}</span> },
    { key: 'status', header: 'Статус', render: (inv) => <StatusBadge status={inv.status} /> },
    { key: 'ref', header: 'Реф.', render: (inv) => <span className="font-mono text-token-xs text-neutral-500">{inv.paymentRef || '—'}</span> },
    { key: 'created', header: 'Создан', render: (inv) => <span className="text-token-xs text-neutral-400">{new Date(inv.createdAt).toLocaleDateString('ru')}</span> },
    {
      key: 'actions',
      header: 'Действия',
      render: (inv) => inv.status === 'PENDING' ? (
        <div className="flex gap-1.5">
          <Button variant="primary" size="sm" onClick={() => moderate(inv.id, 'confirm')} disabled={moderating === inv.id} className="!bg-success">✅</Button>
          <Button variant="danger" size="sm" onClick={() => moderate(inv.id, 'reject')} disabled={moderating === inv.id}>✕</Button>
        </div>
      ) : null,
    },
  ];

  return (
    <div className="p-7">
      {notice && (
        <div className={`fixed top-5 right-5 rounded-token-md px-4 py-2.5 font-bold text-token-sm z-[999] shadow-lg ${notice.startsWith('✅') ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
          {notice}
        </div>
      )}

      <div className="flex items-center justify-between mb-5">
        <h1 className="m-0 text-token-2xl font-extrabold text-neutral-900">Инвойсы</h1>
        <Button variant="primary" onClick={() => setShowCreateForm(true)}>+ Создать инвойс</Button>
      </div>

      {showCreateForm && (
        <Card className="mb-5" style={{ padding: 20 }}>
          <h3 className="mb-3.5 text-token-lg font-bold">Новый инвойс</h3>
          <div className="grid grid-cols-3 gap-2.5">
            <Select value={createForm.tenantId} onChange={(e) => setCreateForm((f) => ({ ...f, tenantId: e.target.value }))}>
              <option value="">Выберите тенант</option>
              {tenants.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
            <Select value={createForm.plan} onChange={(e) => setCreateForm((f) => ({ ...f, plan: e.target.value }))}>
              {['PRO', 'BUSINESS'].map((p) => <option key={p}>{p}</option>)}
            </Select>
            <Input placeholder="Сумма (UZS)" value={createForm.amount} onChange={(e) => setCreateForm((f) => ({ ...f, amount: e.target.value }))} />
            <div className="col-span-2">
              <Input placeholder="Реф. платежа (необяз.)" value={createForm.paymentRef} onChange={(e) => setCreateForm((f) => ({ ...f, paymentRef: e.target.value }))} />
            </div>
            <label className="flex items-center gap-2 text-token-sm">
              <input type="checkbox" checked={createForm.autoConfirm} onChange={(e) => setCreateForm((f) => ({ ...f, autoConfirm: e.target.checked }))} />
              Сразу активировать
            </label>
          </div>
          <div className="flex gap-2 mt-3">
            <Button variant="primary" onClick={submitCreate} disabled={submitting} className="!bg-success">{submitting ? '...' : 'Создать'}</Button>
            <Button variant="ghost" onClick={() => setShowCreateForm(false)}>Отмена</Button>
          </div>
        </Card>
      )}

      {pending.length > 0 && (
        <div className="mb-6">
          <div className="text-token-xs font-bold text-warning uppercase tracking-wide mb-2.5">
            ⏳ Ожидают подтверждения ({pending.length})
          </div>
          <div className="flex flex-col gap-2">
            {pending.map((inv: any) => (
              <div key={inv.id} className="bg-warning/10 border border-warning/30 rounded-token-lg px-4 py-3 flex items-center gap-3.5 flex-wrap">
                <div className="flex-1">
                  <div className="font-bold text-token-base">{inv.tenant?.name || inv.tenantId}</div>
                  <div className="text-token-xs text-neutral-500 mt-0.5">
                    {inv.plan} · {Number(inv.amount).toLocaleString()} UZS
                    {inv.paymentRef && <span className="ml-2 font-mono bg-warning/20 px-1.5 py-0.5 rounded-token-sm">{inv.paymentRef}</span>}
                  </div>
                  <div className="text-[11px] text-neutral-400 mt-0.5">{new Date(inv.createdAt).toLocaleString('ru')}</div>
                </div>
                <div className="flex gap-2">
                  <Button variant="primary" onClick={() => moderate(inv.id, 'confirm')} disabled={moderating === inv.id} className="!bg-success">✅ Подтвердить</Button>
                  <Button variant="danger" onClick={() => moderate(inv.id, 'reject')} disabled={moderating === inv.id}>✕</Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2.5 mb-3.5 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Поиск по тенанту..." />
        </div>
        <Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="w-auto">
          <option value="">Все статусы</option>
          {['PENDING', 'PAID', 'CANCELLED', 'EXPIRED'].map((s) => <option key={s}>{s}</option>)}
        </Select>
      </div>

      <Table columns={columns} data={items} rowKey={(inv) => inv.id} loading={loading} emptyMessage="Нет инвойсов" />

      <div className="flex justify-between items-center text-token-sm text-neutral-500 mt-3">
        <span>Всего: {data?.total || 0}</span>
        <div className="flex gap-2 items-center">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>←</Button>
          <span className="px-2">{page}/{totalPages}</span>
          <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>→</Button>
        </div>
      </div>
    </div>
  );
}
