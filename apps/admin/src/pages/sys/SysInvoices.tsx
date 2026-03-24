import React, { useEffect, useState } from 'react';
import { systemApi } from '../../api/system-admin-client';

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  PENDING:   { bg: '#fef3c7', color: '#92400e' },
  PAID:      { bg: '#d1fae5', color: '#065f46' },
  CANCELLED: { bg: '#fee2e2', color: '#991b1b' },
  EXPIRED:   { bg: '#f3f4f6', color: '#4b5563' },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.EXPIRED;
  return <span style={{ ...s, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>{status}</span>;
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
    systemApi.tenants('pageSize=200').then((d) => setTenants(d?.items || d || [])).catch(() => {});
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

  return (
    <div style={{ padding: 28 }}>
      {notice && <div style={{ position: 'fixed', top: 20, right: 20, background: notice.startsWith('✅') ? '#d1fae5' : '#fee2e2', borderRadius: 8, padding: '10px 16px', fontWeight: 700, fontSize: 13, color: notice.startsWith('✅') ? '#065f46' : '#991b1b', zIndex: 999, boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }}>{notice}</div>}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#0f172a' }}>Инвойсы</h1>
        <button onClick={() => setShowCreateForm(true)} style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
          + Создать инвойс
        </button>
      </div>

      {/* Create form */}
      {showCreateForm && (
        <div style={{ background: '#fff', borderRadius: 12, padding: '20px', marginBottom: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700 }}>Новый инвойс</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            <select value={createForm.tenantId} onChange={(e) => setCreateForm((f) => ({ ...f, tenantId: e.target.value }))}
              style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 13 }}>
              <option value="">Выберите тенант</option>
              {tenants.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <select value={createForm.plan} onChange={(e) => setCreateForm((f) => ({ ...f, plan: e.target.value }))}
              style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 13 }}>
              {['PRO', 'BUSINESS'].map((p) => <option key={p}>{p}</option>)}
            </select>
            <input placeholder="Сумма (UZS)" value={createForm.amount} onChange={(e) => setCreateForm((f) => ({ ...f, amount: e.target.value }))}
              style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 13 }} />
            <input placeholder="Реф. платежа (необяз.)" value={createForm.paymentRef} onChange={(e) => setCreateForm((f) => ({ ...f, paymentRef: e.target.value }))}
              style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 13, gridColumn: '1 / 3' }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={createForm.autoConfirm} onChange={(e) => setCreateForm((f) => ({ ...f, autoConfirm: e.target.checked }))} />
              Сразу активировать
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={submitCreate} disabled={submitting} style={{ background: '#10b981', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
              {submitting ? '...' : 'Создать'}
            </button>
            <button onClick={() => setShowCreateForm(false)} style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', fontSize: 13 }}>Отмена</button>
          </div>
        </div>
      )}

      {/* Pending queue */}
      {pending.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
            ⏳ Ожидают подтверждения ({pending.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pending.map((inv: any) => (
              <div key={inv.id} style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{inv.tenant?.name || inv.tenantId}</div>
                  <div style={{ fontSize: 12, color: '#78716c', marginTop: 2 }}>
                    {inv.plan} · {Number(inv.amount).toLocaleString()} UZS
                    {inv.paymentRef && <span style={{ marginLeft: 8, fontFamily: 'monospace', background: '#fef3c7', padding: '1px 6px', borderRadius: 4 }}>{inv.paymentRef}</span>}
                  </div>
                  <div style={{ fontSize: 11, color: '#a8a29e', marginTop: 2 }}>{new Date(inv.createdAt).toLocaleString('ru')}</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => moderate(inv.id, 'confirm')} disabled={moderating === inv.id}
                    style={{ background: '#22c55e', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                    ✅ Подтвердить
                  </button>
                  <button onClick={() => moderate(inv.id, 'reject')} disabled={moderating === inv.id}
                    style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 12px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Поиск по тенанту..."
          style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 12px', fontSize: 13, flex: 1, minWidth: 200, background: '#fff' }} />
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 13, background: '#fff' }}>
          <option value="">Все статусы</option>
          {['PENDING', 'PAID', 'CANCELLED', 'EXPIRED'].map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              {['Тенант', 'План', 'Сумма', 'Статус', 'Реф.', 'Создан', 'Действия'].map((h) => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && [1,2,3].map((i) => <tr key={i}><td colSpan={7} style={{ padding: 14 }}><div className="sg-skeleton" style={{ height: 14 }} /></td></tr>)}
            {!loading && items.map((inv: any) => (
              <tr key={inv.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '10px 14px', fontWeight: 600 }}>{inv.tenant?.name || inv.tenantId?.slice(0, 12)}</td>
                <td style={{ padding: '10px 14px' }}>{inv.plan}</td>
                <td style={{ padding: '10px 14px', fontWeight: 700 }}>{Number(inv.amount).toLocaleString()}</td>
                <td style={{ padding: '10px 14px' }}><StatusBadge status={inv.status} /></td>
                <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: 12, color: '#64748b' }}>{inv.paymentRef || '—'}</td>
                <td style={{ padding: '10px 14px', fontSize: 12, color: '#94a3b8' }}>{new Date(inv.createdAt).toLocaleDateString('ru')}</td>
                <td style={{ padding: '10px 14px' }}>
                  {inv.status === 'PENDING' && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => moderate(inv.id, 'confirm')} disabled={moderating === inv.id} style={{ background: '#22c55e', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>✅</button>
                      <button onClick={() => moderate(inv.id, 'reject')} disabled={moderating === inv.id} style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>✕</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {!loading && items.length === 0 && <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>Нет инвойсов</td></tr>}
          </tbody>
        </table>
        <div style={{ padding: '10px 14px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#64748b' }}>
          <span>Всего: {data?.total || 0}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} style={{ border: '1px solid #e2e8f0', background: '#fff', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}>←</button>
            <span style={{ padding: '4px 8px' }}>{page}/{totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} style={{ border: '1px solid #e2e8f0', background: '#fff', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}>→</button>
          </div>
        </div>
      </div>
    </div>
  );
}
