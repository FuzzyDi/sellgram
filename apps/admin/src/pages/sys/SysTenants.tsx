import React, { useEffect, useRef, useState } from 'react';
import { systemApi } from '../../api/system-admin-client';
import { setTokens } from '../../api/store-admin-client';

const PLAN_COLORS: Record<string, { bg: string; color: string }> = {
  FREE:     { bg: '#f1f5f9', color: '#475569' },
  PRO:      { bg: '#ede9fe', color: '#5b21b6' },
  BUSINESS: { bg: '#fef3c7', color: '#92400e' },
};

function PlanBadge({ plan }: { plan: string }) {
  const c = PLAN_COLORS[plan] || PLAN_COLORS.FREE;
  return <span style={{ ...c, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>{plan}</span>;
}

function TenantDrawer({ tenant, onClose, onRefresh }: { tenant: any; onClose: () => void; onRefresh: () => void }) {
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState(tenant.plan);
  const [expiresAt, setExpiresAt] = useState(tenant.planExpiresAt ? tenant.planExpiresAt.slice(0, 10) : '');
  const [saving, setSaving] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [impersonating, setImpersonating] = useState(false);
  const [notice, setNotice] = useState('');
  const [resetPwd, setResetPwd] = useState<{ userId: string; name: string } | null>(null);
  const [newPwd, setNewPwd] = useState('');
  const [createInvoice, setCreateInvoice] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState({ plan: tenant.plan, amount: '', paymentRef: '', autoConfirm: false });
  const [submittingInvoice, setSubmittingInvoice] = useState(false);
  const [showExtend, setShowExtend] = useState(false);
  const [extendForm, setExtendForm] = useState({ plan: tenant.plan, months: '1', amount: '', note: '' });
  const [extending, setExtending] = useState(false);

  useEffect(() => {
    systemApi.tenantDetail(tenant.id).then(setDetail).catch(() => {}).finally(() => setLoading(false));
  }, [tenant.id]);

  function showNotice(msg: string) { setNotice(msg); setTimeout(() => setNotice(''), 3000); }

  async function savePlan() {
    if (!window.confirm(`Изменить план на ${plan}?`)) return;
    setSaving(true);
    try {
      await systemApi.setTenantPlan(tenant.id, plan, expiresAt || undefined);
      showNotice('✅ План обновлён');
      onRefresh();
    } catch (e: any) { showNotice('❌ ' + e.message); }
    finally { setSaving(false); }
  }

  async function toggleBlock() {
    const isBlocked = detail?.stores?.every((s: any) => !s.isActive);
    if (!window.confirm(isBlocked ? 'Разблокировать тенант?' : 'Заблокировать тенант?')) return;
    setBlocking(true);
    try {
      if (isBlocked) await systemApi.unblockTenant(tenant.id);
      else await systemApi.blockTenant(tenant.id);
      showNotice('✅ Готово');
      onRefresh();
      onClose();
    } catch (e: any) { showNotice('❌ ' + e.message); }
    finally { setBlocking(false); }
  }

  async function impersonate() {
    if (!window.confirm('Войти как владелец тенанта?')) return;
    setImpersonating(true);
    try {
      const data = await systemApi.impersonate(tenant.id);
      (setTokens as any)(data.accessToken, data.refreshToken);
      window.location.hash = '/';
    } catch (e: any) { showNotice('❌ ' + e.message); }
    finally { setImpersonating(false); }
  }

  async function submitResetPwd() {
    if (!resetPwd || newPwd.length < 6) return;
    try {
      await systemApi.resetUserPassword(resetPwd.userId, newPwd);
      showNotice('✅ Пароль изменён');
      setResetPwd(null);
      setNewPwd('');
    } catch (e: any) { showNotice('❌ ' + e.message); }
  }

  async function submitExtend() {
    if (!extendForm.amount) return;
    setExtending(true);
    try {
      await systemApi.extendPlan(tenant.id, {
        plan: extendForm.plan,
        months: Number(extendForm.months),
        amount: Number(extendForm.amount),
        note: extendForm.note || undefined,
      });
      showNotice('✅ Подписка продлена');
      setShowExtend(false);
      onRefresh();
    } catch (e: any) { showNotice('❌ ' + e.message); }
    finally { setExtending(false); }
  }

  async function submitInvoice() {
    if (!invoiceForm.amount) return;
    setSubmittingInvoice(true);
    try {
      await systemApi.createInvoice({ tenantId: tenant.id, plan: invoiceForm.plan, amount: Number(invoiceForm.amount), paymentRef: invoiceForm.paymentRef || undefined, autoConfirm: invoiceForm.autoConfirm });
      showNotice('✅ Инвойс создан');
      setCreateInvoice(false);
      onRefresh();
    } catch (e: any) { showNotice('❌ ' + e.message); }
    finally { setSubmittingInvoice(false); }
  }

  const isBlocked = detail?.stores?.every((s: any) => !s.isActive) ?? false;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ flex: 1, background: 'rgba(0,0,0,0.35)', cursor: 'pointer' }} />
      <aside style={{ width: 520, maxWidth: '95vw', background: '#fff', height: '100vh', overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 18, boxShadow: '-4px 0 32px rgba(0,0,0,0.15)' }}>
        {notice && <div style={{ position: 'sticky', top: 0, background: notice.startsWith('✅') ? '#d1fae5' : '#fee2e2', border: '1px solid', borderColor: notice.startsWith('✅') ? '#6ee7b7' : '#fca5a5', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontWeight: 700, zIndex: 10, color: notice.startsWith('✅') ? '#065f46' : '#991b1b' }}>{notice}</div>}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{tenant.name}</h2>
            <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: 13 }}>{tenant.slug} · ID: {tenant.id.slice(0, 12)}</p>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 20, color: '#9ca3af' }}>✕</button>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <PlanBadge plan={tenant.plan} />
          {tenant.planExpiresAt && <span style={{ background: '#f1f5f9', color: '#475569', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>до {new Date(tenant.planExpiresAt).toLocaleDateString('ru')}</span>}
          {isBlocked && <span style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>ЗАБЛОКИРОВАН</span>}
        </div>

        {/* Stats */}
        {loading && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>{[1,2,3,4,5,6].map(i => <div key={i} className="sg-skeleton" style={{ height: 56, borderRadius: 8 }} />)}</div>}
        {detail && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {[
              { label: 'Заказов всего', value: detail.stats.ordersTotal },
              { label: 'Заказов /мес', value: detail.stats.ordersMonth },
              { label: 'Товаров', value: detail.stats.productsTotal },
              { label: 'Клиентов', value: detail.stats.customersTotal },
              { label: 'Выручка всего', value: `${(detail.stats.revenueTotal / 1e6).toFixed(1)}M` },
              { label: 'Выручка /мес', value: `${(detail.stats.revenueMonth / 1e6).toFixed(1)}M` },
            ].map(({ label, value }) => (
              <div key={label} style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>{label}</div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Plan change */}
        <div style={{ background: '#f8fafc', borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>Изменить план</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <select value={plan} onChange={(e) => setPlan(e.target.value)}
              style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 13, background: '#fff' }}>
              {['FREE', 'PRO', 'BUSINESS'].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)}
              style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 13, background: '#fff' }} />
            <button onClick={savePlan} disabled={saving} style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
              {saving ? '...' : 'Сохранить'}
            </button>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setShowExtend(true)} style={{ background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            ➕ Продлить
          </button>
          <button onClick={impersonate} disabled={impersonating} style={{ background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            {impersonating ? '...' : '🎭 Impersonate'}
          </button>
          <button onClick={() => setCreateInvoice(true)} style={{ background: '#10b981', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            💳 Инвойс
          </button>
          <button onClick={toggleBlock} disabled={blocking} style={{ background: isBlocked ? '#22c55e' : '#ef4444', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            {blocking ? '...' : isBlocked ? '🔓 Разблок' : '🚫 Блок'}
          </button>
        </div>

        {/* Extend plan form */}
        {showExtend && (
          <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#5b21b6' }}>Продлить подписку</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 4 }}>Тариф</label>
                <select value={extendForm.plan} onChange={(e) => setExtendForm((f) => ({ ...f, plan: e.target.value }))}
                  style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 6, padding: '7px 9px', fontSize: 13 }}>
                  {['FREE', 'PRO', 'BUSINESS'].map((p) => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 4 }}>Месяцев</label>
                <select value={extendForm.months} onChange={(e) => setExtendForm((f) => ({ ...f, months: e.target.value }))}
                  style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 6, padding: '7px 9px', fontSize: 13 }}>
                  {[1,2,3,6,12].map((m) => <option key={m} value={m}>{m} мес.</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 4 }}>Сумма (UZS)</label>
                <input placeholder="500000" value={extendForm.amount} onChange={(e) => setExtendForm((f) => ({ ...f, amount: e.target.value }))}
                  style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d1d5db', borderRadius: 6, padding: '7px 9px', fontSize: 13 }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 4 }}>Примечание</label>
                <input placeholder="Необязательно" value={extendForm.note} onChange={(e) => setExtendForm((f) => ({ ...f, note: e.target.value }))}
                  style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d1d5db', borderRadius: 6, padding: '7px 9px', fontSize: 13 }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={submitExtend} disabled={extending || !extendForm.amount} style={{ background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: !extendForm.amount ? 0.5 : 1 }}>
                {extending ? '...' : 'Продлить'}
              </button>
              <button onClick={() => setShowExtend(false)} style={{ background: '#f1f5f9', border: 'none', borderRadius: 6, padding: '8px 12px', cursor: 'pointer', fontSize: 13 }}>Отмена</button>
            </div>
          </div>
        )}

        {/* Create invoice modal */}
        {createInvoice && (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>Создать инвойс</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <select value={invoiceForm.plan} onChange={(e) => setInvoiceForm((f) => ({ ...f, plan: e.target.value }))}
                style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '7px 9px', fontSize: 13 }}>
                {['PRO', 'BUSINESS'].map((p) => <option key={p}>{p}</option>)}
              </select>
              <input placeholder="Сумма (UZS)" value={invoiceForm.amount} onChange={(e) => setInvoiceForm((f) => ({ ...f, amount: e.target.value }))}
                style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '7px 9px', fontSize: 13 }} />
              <input placeholder="Ref платежа (необяз.)" value={invoiceForm.paymentRef} onChange={(e) => setInvoiceForm((f) => ({ ...f, paymentRef: e.target.value }))}
                style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '7px 9px', fontSize: 13, gridColumn: '1 / -1' }} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={invoiceForm.autoConfirm} onChange={(e) => setInvoiceForm((f) => ({ ...f, autoConfirm: e.target.checked })) } />
              Сразу активировать план
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={submitInvoice} disabled={submittingInvoice} style={{ background: '#10b981', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                {submittingInvoice ? '...' : 'Создать'}
              </button>
              <button onClick={() => setCreateInvoice(false)} style={{ background: '#f1f5f9', border: 'none', borderRadius: 6, padding: '7px 12px', cursor: 'pointer', fontSize: 13 }}>Отмена</button>
            </div>
          </div>
        )}

        {/* Reset password modal */}
        {resetPwd && (
          <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>Сброс пароля: {resetPwd.name}</div>
            <input placeholder="Новый пароль (мин. 6 симв.)" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} type="password"
              style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '7px 9px', fontSize: 13 }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={submitResetPwd} disabled={newPwd.length < 6} style={{ background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Сохранить</button>
              <button onClick={() => { setResetPwd(null); setNewPwd(''); }} style={{ background: '#f1f5f9', border: 'none', borderRadius: 6, padding: '7px 12px', cursor: 'pointer', fontSize: 13 }}>Отмена</button>
            </div>
          </div>
        )}

        {/* Stores */}
        {detail && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Магазины ({detail.stores?.length || 0})</div>
            {(detail.stores || []).map((s: any) => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, background: '#f9fafb', marginBottom: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.isActive ? '#22c55e' : '#ef4444', display: 'inline-block' }} />
                <span style={{ fontWeight: 600, fontSize: 13 }}>{s.name}</span>
                {s.botUsername && <span style={{ fontSize: 11, color: '#94a3b8' }}>@{s.botUsername}</span>}
                <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 'auto' }}>{s.isActive ? 'Активен' : 'Откл.'}</span>
              </div>
            ))}
          </div>
        )}

        {/* Users */}
        {detail && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Пользователи ({detail.users?.length || 0})</div>
            {(detail.users || []).map((u: any) => (
              <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, background: '#f9fafb', marginBottom: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: u.isActive ? '#22c55e' : '#9ca3af', display: 'inline-block' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{u.name}</div>
                  <div style={{ fontSize: 11, color: '#9ca3af' }}>{u.email}</div>
                </div>
                <span style={{ background: '#f1f5f9', color: '#374151', borderRadius: 4, padding: '2px 6px', fontSize: 11, fontWeight: 600 }}>{u.role}</span>
                <button onClick={() => { setResetPwd({ userId: u.id, name: u.name }); setNewPwd(''); }}
                  style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, padding: '3px 8px', fontSize: 11, cursor: 'pointer', color: '#475569' }}>
                  🔑
                </button>
              </div>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}

export default function SysTenants() {
  const [data, setData] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function load(p = page, s = debouncedSearch, plan = planFilter) {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p), pageSize: '25' });
    if (s) params.set('search', s);
    if (plan) params.set('plan', plan);
    systemApi.tenants(params.toString()).then(setData).catch(() => {}).finally(() => setLoading(false));
  }

  useEffect(() => { load(page, debouncedSearch, planFilter); }, [page, debouncedSearch, planFilter]);

  function handleSearch(v: string) {
    setSearch(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setDebouncedSearch(v); setPage(1); }, 300);
  }

  const items: any[] = data?.items || data || [];
  const totalPages = data?.totalPages || 1;

  return (
    <div style={{ padding: 28 }}>
      <h1 style={{ margin: '0 0 20px', fontSize: 22, fontWeight: 800, color: '#0f172a' }}>Тенанты</h1>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input value={search} onChange={(e) => handleSearch(e.target.value)} placeholder="Поиск по имени / slug..."
          style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 12px', fontSize: 13, minWidth: 260, flex: 1, background: '#fff' }} />
        <select value={planFilter} onChange={(e) => { setPlanFilter(e.target.value); setPage(1); }}
          style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 13, background: '#fff' }}>
          <option value="">Все планы</option>
          <option value="FREE">FREE</option>
          <option value="PRO">PRO</option>
          <option value="BUSINESS">BUSINESS</option>
        </select>
      </div>

      <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              {['Тенант', 'План', 'Истекает', 'Магазины', 'Заказов/мес', 'Создан'].map((h) => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && [1,2,3,4,5].map((i) => (
              <tr key={i}><td colSpan={6} style={{ padding: '10px 14px' }}><div className="sg-skeleton" style={{ height: 14, width: '60%' }} /></td></tr>
            ))}
            {!loading && items.map((t: any) => {
              const expiresAt = t.planExpiresAt ? new Date(t.planExpiresAt) : null;
              const expiringSoon = expiresAt && (expiresAt.getTime() - Date.now()) / 86400000 < 7;
              return (
                <tr key={t.id} onClick={() => setSelected(t)} style={{ cursor: 'pointer', borderBottom: '1px solid #f1f5f9', transition: 'background 0.1s' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = '')}>
                  <td style={{ padding: '10px 14px', fontWeight: 700 }}>
                    <div>{t.name}</div>
                    <div style={{ fontWeight: 400, fontSize: 11, color: '#9ca3af' }}>{t.slug}</div>
                  </td>
                  <td style={{ padding: '10px 14px' }}><PlanBadge plan={t.plan} /></td>
                  <td style={{ padding: '10px 14px', color: expiringSoon ? '#f59e0b' : '#64748b', fontWeight: expiringSoon ? 700 : 400 }}>
                    {expiresAt ? expiresAt.toLocaleDateString('ru') : '—'}
                    {expiringSoon && <span style={{ fontSize: 10, marginLeft: 4 }}>⚠️</span>}
                  </td>
                  <td style={{ padding: '10px 14px' }}>{t.storesCount ?? t._count?.stores ?? '—'}</td>
                  <td style={{ padding: '10px 14px' }}>{t.ordersMonth ?? '—'}</td>
                  <td style={{ padding: '10px 14px', color: '#94a3b8', fontSize: 12 }}>{new Date(t.createdAt).toLocaleDateString('ru')}</td>
                </tr>
              );
            })}
            {!loading && items.length === 0 && (
              <tr><td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>Ничего не найдено</td></tr>
            )}
          </tbody>
        </table>
        <div style={{ padding: '10px 14px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, color: '#64748b' }}>
          <span>Всего: {data?.total || items.length}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} style={{ border: '1px solid #e2e8f0', background: '#fff', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}>← Назад</button>
            <span style={{ padding: '4px 8px' }}>{page} / {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} style={{ border: '1px solid #e2e8f0', background: '#fff', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}>Далее →</button>
          </div>
        </div>
      </div>

      {selected && (
        <TenantDrawer tenant={selected} onClose={() => setSelected(null)} onRefresh={() => load(page, debouncedSearch, planFilter)} />
      )}
    </div>
  );
}
