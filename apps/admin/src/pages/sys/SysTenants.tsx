import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { systemApi } from '../../api/system-admin-client';
import { setTokens } from '../../api/store-admin-client';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Input from '../../components/Input';
import Select from '../../components/Select';
import Badge, { BadgeVariant } from '../../components/Badge';
import Table, { TableColumn } from '../../components/Table';

const PLAN_VARIANT: Record<string, BadgeVariant> = {
  FREE: 'neutral',
  PRO: 'info',
  BUSINESS: 'warning',
};

function PlanBadge({ plan }: { plan: string }) {
  return <Badge variant={PLAN_VARIANT[plan] || 'neutral'}>{plan}</Badge>;
}

function ReminderButton({ tenantId }: { tenantId: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle');
  async function send() {
    setState('loading');
    try {
      await systemApi.sendReminder(tenantId);
      setState('sent');
      setTimeout(() => setState('idle'), 3000);
    } catch {
      setState('error');
      setTimeout(() => setState('idle'), 3000);
    }
  }
  const label = state === 'loading' ? '...' : state === 'sent' ? '✓ Отправлено' : state === 'error' ? '✗ Ошибка' : 'Напомнить';
  const cls = state === 'sent' ? 'bg-success/15 text-success' : state === 'error' ? 'bg-danger/15 text-danger' : 'bg-warning/15 text-warning';
  return (
    <button disabled={state === 'loading' || state === 'sent'} onClick={send}
      className={`border-none rounded-token-sm px-2.5 py-1 text-token-xs font-bold transition-colors ${state === 'loading' || state === 'sent' ? 'cursor-default' : 'cursor-pointer'} ${cls}`}>
      {label}
    </button>
  );
}

function TenantDrawer({ tenant, onClose, onRefresh }: { tenant: any; onClose: () => void; onRefresh: () => void }) {
  const navigate = useNavigate();
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
    systemApi.tenantDetail(tenant.id).then(setDetail).catch(() => showNotice('❌ Не удалось загрузить детали тенанта')).finally(() => setLoading(false));
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
      navigate('/');
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
    <div className="fixed inset-0 z-[500] flex justify-end">
      <div onClick={onClose} className="flex-1 bg-black/35 cursor-pointer" />
      <aside className="w-[520px] max-w-[95vw] bg-white h-screen overflow-y-auto flex flex-col gap-4 shadow-2xl" style={{ padding: 24 }}>
        {notice && (
          <div className={`sticky top-0 border rounded-token-md px-3 py-2 text-token-sm font-bold z-10 ${notice.startsWith('✅') ? 'bg-success/10 border-success/40 text-success' : 'bg-danger/10 border-danger/40 text-danger'}`}>
            {notice}
          </div>
        )}

        <div className="flex justify-between items-start">
          <div>
            <h2 className="m-0 text-token-xl font-extrabold">{tenant.name}</h2>
            <p className="mt-1 mb-0 text-neutral-400 text-token-sm">{tenant.slug} · ID: {tenant.id.slice(0, 12)}</p>
          </div>
          <button onClick={onClose} className="border-none bg-transparent cursor-pointer text-token-xl text-neutral-400">✕</button>
        </div>

        <div className="flex gap-2">
          <PlanBadge plan={tenant.plan} />
          {tenant.planExpiresAt && <Badge variant="neutral">до {new Date(tenant.planExpiresAt).toLocaleDateString('ru')}</Badge>}
          {isBlocked && <Badge variant="danger">ЗАБЛОКИРОВАН</Badge>}
        </div>

        {loading && <div className="grid grid-cols-3 gap-2">{[1,2,3,4,5,6].map(i => <div key={i} className="animate-pulse bg-neutral-200 rounded-token-md" style={{ height: 56 }} />)}</div>}
        {detail && (
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Заказов всего', value: detail.stats.ordersTotal },
              { label: 'Заказов /мес', value: detail.stats.ordersMonth },
              { label: 'Товаров', value: detail.stats.productsTotal },
              { label: 'Клиентов', value: detail.stats.customersTotal },
              { label: 'Выручка всего', value: `${(detail.stats.revenueTotal / 1e6).toFixed(1)}M` },
              { label: 'Выручка /мес', value: `${(detail.stats.revenueMonth / 1e6).toFixed(1)}M` },
            ].map(({ label, value }) => (
              <div key={label} className="bg-neutral-50 rounded-token-md px-3 py-2.5">
                <div className="text-token-xs text-neutral-500 mb-1">{label}</div>
                <div className="font-extrabold text-token-base">{value}</div>
              </div>
            ))}
          </div>
        )}

        <div className="bg-neutral-50 rounded-token-lg px-4 py-3.5">
          <div className="text-token-xs font-bold text-neutral-700 uppercase tracking-wide mb-2.5">Изменить план</div>
          <div className="flex gap-2 items-end flex-wrap">
            <Select value={plan} onChange={(e) => setPlan(e.target.value)} className="w-auto">
              {['FREE', 'PRO', 'BUSINESS'].map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
            <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)}
              className="border border-neutral-300 rounded-token-md px-2.5 py-2 text-token-sm bg-white focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500" />
            <Button variant="primary" onClick={savePlan} disabled={saving}>{saving ? '...' : 'Сохранить'}</Button>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setShowExtend(true)} className="bg-violet-600 text-white border-none rounded-token-md px-3.5 py-2 font-bold text-token-sm cursor-pointer">
            ➕ Продлить
          </button>
          <button onClick={impersonate} disabled={impersonating} className="bg-warning text-white border-none rounded-token-md px-3.5 py-2 font-bold text-token-sm cursor-pointer disabled:opacity-70">
            {impersonating ? '...' : '🎭 Impersonate'}
          </button>
          <Button variant="primary" onClick={() => setCreateInvoice(true)} className="!bg-success">💳 Инвойс</Button>
          <button onClick={toggleBlock} disabled={blocking} className={`text-white border-none rounded-token-md px-3.5 py-2 font-bold text-token-sm cursor-pointer disabled:opacity-70 ${isBlocked ? 'bg-success' : 'bg-danger'}`}>
            {blocking ? '...' : isBlocked ? '🔓 Разблок' : '🚫 Блок'}
          </button>
        </div>

        {showExtend && (
          <Card className="flex flex-col gap-2.5" style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', padding: '14px 16px' }}>
            <div className="font-bold text-token-sm text-violet-800">Продлить подписку</div>
            <div className="grid grid-cols-2 gap-2">
              <Select label="Тариф" value={extendForm.plan} onChange={(e) => setExtendForm((f) => ({ ...f, plan: e.target.value }))}>
                {['FREE', 'PRO', 'BUSINESS'].map((p) => <option key={p}>{p}</option>)}
              </Select>
              <Select label="Месяцев" value={extendForm.months} onChange={(e) => setExtendForm((f) => ({ ...f, months: e.target.value }))}>
                {[1,2,3,6,12].map((m) => <option key={m} value={m}>{m} мес.</option>)}
              </Select>
              <Input label="Сумма (UZS)" placeholder="500000" value={extendForm.amount} onChange={(e) => setExtendForm((f) => ({ ...f, amount: e.target.value }))} />
              <Input label="Примечание" placeholder="Необязательно" value={extendForm.note} onChange={(e) => setExtendForm((f) => ({ ...f, note: e.target.value }))} />
            </div>
            <div className="flex gap-2">
              <Button variant="primary" onClick={submitExtend} disabled={extending || !extendForm.amount} className="!bg-violet-600">
                {extending ? '...' : 'Продлить'}
              </Button>
              <Button variant="ghost" onClick={() => setShowExtend(false)}>Отмена</Button>
            </div>
          </Card>
        )}

        {createInvoice && (
          <Card className="flex flex-col gap-2.5" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '14px 16px' }}>
            <div className="font-bold text-token-sm">Создать инвойс</div>
            <div className="grid grid-cols-2 gap-2">
              <Select value={invoiceForm.plan} onChange={(e) => setInvoiceForm((f) => ({ ...f, plan: e.target.value }))}>
                {['PRO', 'BUSINESS'].map((p) => <option key={p}>{p}</option>)}
              </Select>
              <Input placeholder="Сумма (UZS)" value={invoiceForm.amount} onChange={(e) => setInvoiceForm((f) => ({ ...f, amount: e.target.value }))} />
              <div className="col-span-2">
                <Input placeholder="Ref платежа (необяз.)" value={invoiceForm.paymentRef} onChange={(e) => setInvoiceForm((f) => ({ ...f, paymentRef: e.target.value }))} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-token-sm">
              <input type="checkbox" checked={invoiceForm.autoConfirm} onChange={(e) => setInvoiceForm((f) => ({ ...f, autoConfirm: e.target.checked })) } />
              Сразу активировать план
            </label>
            <div className="flex gap-2">
              <Button variant="primary" onClick={submitInvoice} disabled={submittingInvoice} className="!bg-success">
                {submittingInvoice ? '...' : 'Создать'}
              </Button>
              <Button variant="ghost" onClick={() => setCreateInvoice(false)}>Отмена</Button>
            </div>
          </Card>
        )}

        {resetPwd && (
          <Card className="flex flex-col gap-2.5" style={{ background: '#fff7ed', border: '1px solid #fed7aa', padding: '14px 16px' }}>
            <div className="font-bold text-token-sm">Сброс пароля: {resetPwd.name}</div>
            <Input placeholder="Новый пароль (мин. 6 симв.)" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} type="password" />
            <div className="flex gap-2">
              <Button variant="primary" onClick={submitResetPwd} disabled={newPwd.length < 6} className="!bg-warning">Сохранить</Button>
              <Button variant="ghost" onClick={() => { setResetPwd(null); setNewPwd(''); }}>Отмена</Button>
            </div>
          </Card>
        )}

        {detail && (
          <div>
            <div className="text-token-xs font-bold text-neutral-700 uppercase tracking-wide mb-2">Магазины ({detail.stores?.length || 0})</div>
            {(detail.stores || []).map((s: any) => (
              <div key={s.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-token-md bg-neutral-50 mb-1">
                <span className={`w-2 h-2 rounded-full inline-block ${s.isActive ? 'bg-success' : 'bg-danger'}`} />
                <span className="font-semibold text-token-sm">{s.name}</span>
                {s.botUsername && <span className="text-token-xs text-neutral-400">@{s.botUsername}</span>}
                <span className="text-token-xs text-neutral-400 ml-auto">{s.isActive ? 'Активен' : 'Откл.'}</span>
              </div>
            ))}
          </div>
        )}

        {detail && (
          <div>
            <div className="text-token-xs font-bold text-neutral-700 uppercase tracking-wide mb-2">Пользователи ({detail.users?.length || 0})</div>
            {(detail.users || []).map((u: any) => (
              <div key={u.id} className="flex items-center gap-2 px-2.5 py-2 rounded-token-md bg-neutral-50 mb-1">
                <span className={`w-2 h-2 rounded-full inline-block ${u.isActive ? 'bg-success' : 'bg-neutral-400'}`} />
                <div className="flex-1">
                  <div className="font-semibold text-token-sm">{u.name}</div>
                  <div className="text-token-xs text-neutral-400">{u.email}</div>
                </div>
                <Badge variant="neutral">{u.role}</Badge>
                <button onClick={() => { setResetPwd({ userId: u.id, name: u.name }); setNewPwd(''); }}
                  className="bg-transparent border border-neutral-200 rounded-token-sm px-2 py-0.5 text-token-xs cursor-pointer text-neutral-600">
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

function StalledOnboardingPanel({ onSelect }: { onSelect: (t: any) => void }) {
  const [items, setItems] = useState<any[] | null>(null);

  useEffect(() => {
    systemApi.stalledOnboarding().then(setItems).catch(() => setItems([]));
  }, []);

  if (!items || items.length === 0) return null;

  return (
    <Card className="mb-4" style={{ background: '#fffbeb', border: '1px solid #fde68a', padding: '14px 16px' }}>
      <div className="font-bold text-token-sm text-warning mb-2.5">
        ⚠️ Зависшие регистрации ({items.length}) — магазин создан, бот так и не подключён (или магазина ещё нет)
      </div>
      <div className="flex flex-col gap-1.5">
        {items.map((t) => (
          <div key={t.id} onClick={() => onSelect(t)}
            className="flex items-center gap-2.5 bg-white rounded-token-md px-2.5 py-2 cursor-pointer text-token-sm">
            <span className="font-bold">{t.name}</span>
            <span className="text-neutral-400 text-token-xs">{t.slug}</span>
            <Badge variant={t.stage === 'NO_STORE' ? 'danger' : 'warning'}>
              {t.stage === 'NO_STORE' ? 'магазин не создан' : 'бот не подключён'}
            </Badge>
            <span className="text-neutral-500">{t.daysSinceRegistration} дн. с регистрации</span>
            {t.ownerEmail && (
              <a href={`mailto:${t.ownerEmail}`} onClick={(e) => e.stopPropagation()} className="ml-auto text-accent-600 text-token-xs">
                ✉ {t.ownerEmail}
              </a>
            )}
            {t.ownerHasTelegram && <span className="text-token-xs text-sky-500">📱 TG</span>}
          </div>
        ))}
      </div>
    </Card>
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
  const [notice, setNotice] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showNotice(msg: string) { setNotice(msg); setTimeout(() => setNotice(''), 3000); }

  function load(p = page, s = debouncedSearch, plan = planFilter) {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p), pageSize: '25' });
    if (s) params.set('search', s);
    if (plan) params.set('plan', plan);
    systemApi.tenants(params.toString()).then(setData).catch(() => showNotice('❌ Не удалось загрузить список тенантов')).finally(() => setLoading(false));
  }

  useEffect(() => { load(page, debouncedSearch, planFilter); }, [page, debouncedSearch, planFilter]);

  function handleSearch(v: string) {
    setSearch(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setDebouncedSearch(v); setPage(1); }, 300);
  }

  const items: any[] = data?.items || data || [];
  const totalPages = data?.totalPages || 1;

  const columns: TableColumn<any>[] = [
    {
      key: 'tenant',
      header: 'Тенант',
      render: (t) => (
        <div>
          <div className="font-bold">{t.name}</div>
          <div className="font-normal text-token-xs text-neutral-400">{t.slug}</div>
        </div>
      ),
    },
    { key: 'plan', header: 'План', render: (t) => <PlanBadge plan={t.plan} /> },
    {
      key: 'expires',
      header: 'Истекает',
      render: (t) => {
        const expiresAt = t.planExpiresAt ? new Date(t.planExpiresAt) : null;
        const expiringSoon = expiresAt && (expiresAt.getTime() - Date.now()) / 86400000 < 7;
        return (
          <span className={expiringSoon ? 'text-warning font-bold' : 'text-neutral-500'}>
            {expiresAt ? expiresAt.toLocaleDateString('ru') : '—'}
            {expiringSoon && <span className="text-[10px] ml-1">⚠️</span>}
          </span>
        );
      },
    },
    { key: 'stores', header: 'Магазины', render: (t) => t.storesCount ?? t._count?.stores ?? '—' },
    { key: 'orders', header: 'Заказов/мес', render: (t) => t.ordersMonth ?? '—' },
    { key: 'created', header: 'Создан', render: (t) => <span className="text-token-xs text-neutral-400">{new Date(t.createdAt).toLocaleDateString('ru')}</span> },
    {
      key: 'actions',
      header: '',
      render: (t) => {
        const expiresAt = t.planExpiresAt ? new Date(t.planExpiresAt) : null;
        const expiringSoon = expiresAt && (expiresAt.getTime() - Date.now()) / 86400000 < 7;
        return expiringSoon ? <ReminderButton tenantId={t.id} /> : null;
      },
    },
  ];

  return (
    <div className="p-7">
      {notice && (
        <div className="fixed top-5 right-5 rounded-token-md px-4 py-2.5 font-bold text-token-sm z-[999] shadow-lg bg-danger/10 text-danger">
          {notice}
        </div>
      )}

      <h1 className="mb-5 text-token-2xl font-extrabold text-neutral-900">Тенанты</h1>

      <StalledOnboardingPanel onSelect={setSelected} />

      <div className="flex gap-2.5 mb-4 flex-wrap">
        <div className="flex-1 min-w-[260px]">
          <Input value={search} onChange={(e) => handleSearch(e.target.value)} placeholder="Поиск по имени / slug..." />
        </div>
        <Select value={planFilter} onChange={(e) => { setPlanFilter(e.target.value); setPage(1); }} className="w-auto">
          <option value="">Все планы</option>
          <option value="FREE">FREE</option>
          <option value="PRO">PRO</option>
          <option value="BUSINESS">BUSINESS</option>
        </Select>
      </div>

      <Table columns={columns} data={items} rowKey={(t) => t.id} onRowClick={setSelected} loading={loading} emptyMessage="Ничего не найдено" />

      <div className="flex justify-between items-center text-token-sm text-neutral-500 mt-3">
        <span>Всего: {data?.total || items.length}</span>
        <div className="flex gap-2 items-center">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Назад</Button>
          <span className="px-2">{page} / {totalPages}</span>
          <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Далее →</Button>
        </div>
      </div>

      {selected && (
        <TenantDrawer tenant={selected} onClose={() => setSelected(null)} onRefresh={() => load(page, debouncedSearch, planFilter)} />
      )}
    </div>
  );
}
