import React, { useEffect, useRef, useState } from 'react';
import { systemApi } from '../../api/system-admin-client';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Input from '../../components/Input';
import Select from '../../components/Select';
import Table, { TableColumn } from '../../components/Table';

// Role color-coding needs four distinct categorical colors; Badge's
// variant palette only has five generic ones and two of those would
// collapse together (OWNER/MANAGER both landing on "info"), losing the
// at-a-glance role distinction. Kept as plain spans using the same
// token spacing/radius/font scale Badge itself uses, with role-specific
// colors Badge can't express — not routed through the Badge component,
// since overriding its variant classes via className races two
// same-specificity Tailwind utilities (Card.tsx's own documented caveat).
const ROLE_CLASSES: Record<string, string> = {
  OWNER: 'bg-violet-100 text-violet-800',
  MANAGER: 'bg-blue-100 text-blue-800',
  OPERATOR: 'bg-emerald-100 text-emerald-800',
  MARKETER: 'bg-amber-100 text-amber-800',
};

export default function SysUsers() {
  const [data, setData] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [resetTarget, setResetTarget] = useState<{ id: string; name: string; email: string } | null>(null);
  const [newPwd, setNewPwd] = useState('');
  const [notice, setNotice] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showNotice(msg: string) { setNotice(msg); setTimeout(() => setNotice(''), 3000); }

  function load(p = page, s = debouncedSearch, role = roleFilter) {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p), pageSize: '30' });
    if (s) params.set('search', s);
    if (role) params.set('role', role);
    systemApi.users(params.toString()).then(setData).catch(() => {}).finally(() => setLoading(false));
  }

  useEffect(() => { load(page, debouncedSearch, roleFilter); }, [page, debouncedSearch, roleFilter]);

  function handleSearch(v: string) {
    setSearch(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setDebouncedSearch(v); setPage(1); }, 300);
  }

  async function submitReset() {
    if (!resetTarget || newPwd.length < 6) return;
    try {
      await systemApi.resetUserPassword(resetTarget.id, newPwd);
      showNotice('✅ Пароль обновлён');
      setResetTarget(null);
      setNewPwd('');
    } catch (e: any) { showNotice('❌ ' + e.message); }
  }

  const items: any[] = data?.items || [];
  const totalPages = data?.totalPages || 1;

  const columns: TableColumn<any>[] = [
    { key: 'name', header: 'Пользователь', render: (u) => <span className="font-semibold">{u.name || '—'}</span> },
    { key: 'email', header: 'Email', render: (u) => <span className="text-neutral-500">{u.email}</span> },
    {
      key: 'role',
      header: 'Роль',
      render: (u) => (
        <span className={`rounded-token-sm px-2 py-0.5 text-token-xs font-bold ${ROLE_CLASSES[u.role] || 'bg-neutral-100 text-neutral-700'}`}>
          {u.role}
        </span>
      ),
    },
    { key: 'tenant', header: 'Тенант', render: (u) => <span className="text-token-xs text-neutral-500">{u.tenant?.name || u.tenantId?.slice(0, 12)}</span> },
    {
      key: 'status',
      header: 'Статус',
      render: (u) => <span className={`w-2 h-2 rounded-full inline-block ${u.isActive ? 'bg-success' : 'bg-neutral-400'}`} />,
    },
    {
      key: 'actions',
      header: 'Действия',
      render: (u) => (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => { setResetTarget({ id: u.id, name: u.name, email: u.email }); setNewPwd(''); }}
        >
          🔑 Пароль
        </Button>
      ),
    },
  ];

  return (
    <div className="p-7">
      {notice && (
        <div className={`fixed top-5 right-5 rounded-token-md px-4 py-2.5 font-bold text-token-sm z-[999] shadow-lg ${notice.startsWith('✅') ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
          {notice}
        </div>
      )}

      <h1 className="mb-5 text-token-2xl font-extrabold text-neutral-900">Пользователи</h1>

      <div className="flex gap-2.5 mb-4 flex-wrap">
        <div className="flex-1 min-w-[240px]">
          <Input value={search} onChange={(e) => handleSearch(e.target.value)} placeholder="Поиск: имя, email..." />
        </div>
        <Select value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }} className="w-auto">
          <option value="">Все роли</option>
          {['OWNER', 'MANAGER', 'OPERATOR', 'MARKETER'].map((r) => <option key={r}>{r}</option>)}
        </Select>
      </div>

      {resetTarget && (
        <Card className="mb-4 border-warning/40">
          <div className="font-bold text-token-sm mb-3">🔑 Сброс пароля: {resetTarget.name} ({resetTarget.email})</div>
          <div className="flex gap-2.5 items-start">
            <div className="flex-1">
              <Input type="password" placeholder="Новый пароль (мин. 6 симв.)" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} />
            </div>
            <Button variant="primary" onClick={submitReset} disabled={newPwd.length < 6}>Сохранить</Button>
            <Button variant="ghost" onClick={() => { setResetTarget(null); setNewPwd(''); }}>Отмена</Button>
          </div>
        </Card>
      )}

      <Table columns={columns} data={items} rowKey={(u) => u.id} loading={loading} emptyMessage="Ничего не найдено" />

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
