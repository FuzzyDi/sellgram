import React, { useEffect, useRef, useState } from 'react';
import { systemApi } from '../../api/system-admin-client';

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

  const ROLE_COLORS: Record<string, { bg: string; color: string }> = {
    OWNER:    { bg: '#ede9fe', color: '#5b21b6' },
    MANAGER:  { bg: '#dbeafe', color: '#1e40af' },
    OPERATOR: { bg: '#d1fae5', color: '#065f46' },
    MARKETER: { bg: '#fef3c7', color: '#92400e' },
  };

  return (
    <div style={{ padding: 28 }}>
      {notice && <div style={{ position: 'fixed', top: 20, right: 20, background: notice.startsWith('✅') ? '#d1fae5' : '#fee2e2', borderRadius: 8, padding: '10px 16px', fontWeight: 700, fontSize: 13, color: notice.startsWith('✅') ? '#065f46' : '#991b1b', zIndex: 999, boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }}>{notice}</div>}

      <h1 style={{ margin: '0 0 20px', fontSize: 22, fontWeight: 800, color: '#0f172a' }}>Пользователи</h1>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input value={search} onChange={(e) => handleSearch(e.target.value)} placeholder="Поиск: имя, email..."
          style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 12px', fontSize: 13, flex: 1, minWidth: 240, background: '#fff' }} />
        <select value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
          style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 13, background: '#fff' }}>
          <option value="">Все роли</option>
          {['OWNER', 'MANAGER', 'OPERATOR', 'MARKETER'].map((r) => <option key={r}>{r}</option>)}
        </select>
      </div>

      {/* Reset password modal */}
      {resetTarget && (
        <div style={{ background: '#fff', borderRadius: 12, padding: 20, marginBottom: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #fed7aa' }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>🔑 Сброс пароля: {resetTarget.name} ({resetTarget.email})</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <input type="password" placeholder="Новый пароль (мин. 6 симв.)" value={newPwd} onChange={(e) => setNewPwd(e.target.value)}
              style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 12px', fontSize: 13, flex: 1 }} />
            <button onClick={submitReset} disabled={newPwd.length < 6} style={{ background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Сохранить</button>
            <button onClick={() => { setResetTarget(null); setNewPwd(''); }} style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', fontSize: 13 }}>Отмена</button>
          </div>
        </div>
      )}

      <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              {['Пользователь', 'Email', 'Роль', 'Тенант', 'Статус', 'Действия'].map((h) => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && [1,2,3,4].map((i) => <tr key={i}><td colSpan={6} style={{ padding: 14 }}><div className="sg-skeleton" style={{ height: 14, width: '50%' }} /></td></tr>)}
            {!loading && items.map((u: any) => {
              const rc = ROLE_COLORS[u.role] || { bg: '#f1f5f9', color: '#374151' };
              return (
                <tr key={u.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 600 }}>{u.name || '—'}</td>
                  <td style={{ padding: '10px 14px', color: '#64748b' }}>{u.email}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ ...rc, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>{u.role}</span>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: '#64748b' }}>{u.tenant?.name || u.tenantId?.slice(0, 12)}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: u.isActive ? '#22c55e' : '#9ca3af', display: 'inline-block' }} />
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <button onClick={() => { setResetTarget({ id: u.id, name: u.name, email: u.email }); setNewPwd(''); }}
                      style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer', color: '#475569' }}>
                      🔑 Пароль
                    </button>
                  </td>
                </tr>
              );
            })}
            {!loading && items.length === 0 && <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>Ничего не найдено</td></tr>}
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
