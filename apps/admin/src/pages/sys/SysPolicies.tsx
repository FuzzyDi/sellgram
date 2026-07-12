import React, { useEffect, useState } from 'react';
import { systemApi } from '../../api/system-admin-client';

const SCOPES = ['SALE', 'REFUND', 'PAYMENT', 'MARKING', 'SHIFT', 'DISCOUNT', 'CASHIER', 'PRINT'] as const;
const SEVERITIES = ['BLOCK', 'WARN', 'REQUIRE_MANAGER', 'REQUIRE_ACTION', 'INFO'] as const;

const SCOPE_BADGE = { bg: '#eef2ff', color: '#4338ca' };

const SEVERITY_BADGE: Record<string, { bg: string; color: string }> = {
  BLOCK: { bg: '#fee2e2', color: '#991b1b' },
  WARN: { bg: '#fef3c7', color: '#92400e' },
  REQUIRE_MANAGER: { bg: '#fef3c7', color: '#92400e' },
  REQUIRE_ACTION: { bg: '#fef3c7', color: '#92400e' },
  INFO: { bg: '#f1f5f9', color: '#475569' },
};

const ENABLED_BADGE = {
  on: { bg: '#d1fae5', color: '#065f46' },
  off: { bg: '#f1f5f9', color: '#475569' },
};

function Badge({ label, style }: { label: string; style: { bg: string; color: string } }) {
  return (
    <span style={{ background: style.bg, color: style.color, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
      {label}
    </span>
  );
}

interface PolicyForm {
  scope: string;
  severity: string;
  enabled: boolean;
  matchText: string;
  messageRu: string;
  messageUz: string;
  extraText: string;
}

const EMPTY_FORM: PolicyForm = {
  scope: 'SALE',
  severity: 'BLOCK',
  enabled: true,
  matchText: '{}',
  messageRu: '',
  messageUz: '',
  extraText: '',
};

function policyToForm(policy: any): PolicyForm {
  return {
    scope: policy.scope,
    severity: policy.severity,
    enabled: policy.enabled,
    matchText: JSON.stringify(policy.match ?? {}, null, 2),
    messageRu: policy.message?.ru || '',
    messageUz: policy.message?.uz || '',
    extraText: policy.extra ? JSON.stringify(policy.extra, null, 2) : '',
  };
}

export default function SysPolicies() {
  const [policies, setPolicies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState<number | null>(null);
  const [notice, setNotice] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<PolicyForm>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function showNotice(msg: string) { setNotice(msg); setTimeout(() => setNotice(''), 3000); }

  function loadVersion() {
    systemApi.platformPolicyVersion().then((d) => setVersion(d.version)).catch(() => {});
  }

  function load() {
    setLoading(true);
    systemApi.platformPolicies().then(setPolicies).catch(() => {}).finally(() => setLoading(false));
    loadVersion();
  }

  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setShowForm(true);
  }

  function openEdit(policy: any) {
    setEditing(policy);
    setForm(policyToForm(policy));
    setFormError('');
    setShowForm(true);
  }

  async function submitForm() {
    setFormError('');
    let match: Record<string, unknown>;
    let extra: Record<string, unknown> | undefined;
    try {
      match = JSON.parse(form.matchText || '{}');
    } catch {
      setFormError('match: невалидный JSON');
      return;
    }
    if (form.extraText.trim()) {
      try {
        extra = JSON.parse(form.extraText);
      } catch {
        setFormError('extra: невалидный JSON');
        return;
      }
    }
    if (!form.messageRu.trim() || !form.messageUz.trim()) {
      setFormError('Заполните текст правила на обоих языках');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        scope: form.scope,
        severity: form.severity,
        enabled: form.enabled,
        match,
        message: { ru: form.messageRu.trim(), uz: form.messageUz.trim() },
        extra,
      };
      if (editing) {
        await systemApi.updatePlatformPolicy(editing.id, payload);
        showNotice('✅ Правило обновлено');
      } else {
        await systemApi.createPlatformPolicy(payload);
        showNotice('✅ Правило создано');
      }
      setShowForm(false);
      load();
    } catch (e: any) {
      setFormError(e.message || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Удалить это правило политики?')) return;
    setDeletingId(id);
    try {
      await systemApi.deletePlatformPolicy(id);
      showNotice('✅ Правило удалено');
      load();
    } catch (e: any) {
      showNotice('❌ ' + e.message);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div style={{ padding: 28 }}>
      {notice && (
        <div style={{ position: 'fixed', top: 20, right: 20, background: notice.startsWith('✅') ? '#d1fae5' : '#fee2e2', borderRadius: 8, padding: '10px 16px', fontWeight: 700, fontSize: 13, color: notice.startsWith('✅') ? '#065f46' : '#991b1b', zIndex: 999, boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }}>
          {notice}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#0f172a' }}>Платформенные политики</h1>
          <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: 13 }}>Глобальные правила для POS (docs/POS_POLICY_ENGINE.md §11)</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748b' }}>
            policiesVersion: <b style={{ color: '#0f172a' }}>{version ?? '—'}</b>
            <button onClick={loadVersion} title="Обновить версию"
              style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, padding: '3px 8px', fontSize: 12, cursor: 'pointer', color: '#475569' }}>
              ↻
            </button>
          </span>
          <button onClick={openCreate} style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            + Новое правило
          </button>
        </div>
      </div>

      {/* Form modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,23,42,0.45)' }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 520, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.35)' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 800 }}>
              {editing ? 'Редактировать правило' : 'Новое правило'}
            </h3>

            {formError && (
              <div style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontWeight: 600, marginBottom: 14 }}>
                {formError}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 4 }}>Scope</label>
                <select value={form.scope} onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value }))}
                  style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 13, background: '#fff' }}>
                  {SCOPES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 4 }}>Severity</label>
                <select value={form.severity} onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value }))}
                  style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 13, background: '#fff' }}>
                  {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, marginBottom: 14 }}>
              <input type="checkbox" checked={form.enabled} onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))} />
              Правило активно
            </label>

            <div style={{ marginBottom: 10 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 4 }}>Текст правила (RU)</label>
              <input value={form.messageRu} onChange={(e) => setForm((f) => ({ ...f, messageRu: e.target.value }))}
                placeholder="Например: Табак и алкоголь нельзя продавать за наличные"
                style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 13 }} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 4 }}>Текст правила (UZ)</label>
              <input value={form.messageUz} onChange={(e) => setForm((f) => ({ ...f, messageUz: e.target.value }))}
                placeholder="Masalan: Tamaki va alkogolni naqd pulga sotib bo'lmaydi"
                style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 13 }} />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 4 }}>
                match (JSON) — условие срабатывания правила
              </label>
              <textarea value={form.matchText} onChange={(e) => setForm((f) => ({ ...f, matchText: e.target.value }))}
                rows={4} spellCheck={false}
                style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 12, fontFamily: 'monospace', resize: 'vertical' }} />
            </div>

            <div style={{ marginBottom: 4 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 4 }}>
                extra (JSON, необязательно) — доп. поля вроде denyPayments
              </label>
              <textarea value={form.extraText} onChange={(e) => setForm((f) => ({ ...f, extraText: e.target.value }))}
                rows={3} spellCheck={false} placeholder='{"denyPayments":["CASH"]}'
                style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 12, fontFamily: 'monospace', resize: 'vertical' }} />
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={submitForm} disabled={saving}
                style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                {saving ? '...' : editing ? 'Сохранить' : 'Создать'}
              </button>
              <button onClick={() => setShowForm(false)} disabled={saving}
                style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, padding: '9px 14px', cursor: 'pointer', fontSize: 13 }}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              {['Scope', 'Severity', 'Статус', 'Правило', ''].map((h) => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && [1, 2, 3].map((i) => (
              <tr key={i}><td colSpan={5} style={{ padding: 14 }}><div className="animate-pulse bg-neutral-200 rounded" style={{ height: 14, width: '60%' }} /></td></tr>
            ))}
            {!loading && policies.map((p: any) => (
              <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '10px 14px' }}><Badge label={p.scope} style={SCOPE_BADGE} /></td>
                <td style={{ padding: '10px 14px' }}><Badge label={p.severity} style={SEVERITY_BADGE[p.severity] || SEVERITY_BADGE.INFO} /></td>
                <td style={{ padding: '10px 14px' }}>
                  <Badge label={p.enabled ? 'Включено' : 'Выключено'} style={p.enabled ? ENABLED_BADGE.on : ENABLED_BADGE.off} />
                </td>
                <td style={{ padding: '10px 14px', maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.message?.ru || '—'}
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => openEdit(p)}
                      style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer', color: '#475569' }}>
                      Редактировать
                    </button>
                    <button onClick={() => remove(p.id)} disabled={deletingId === p.id}
                      style={{ background: 'none', border: '1px solid #fecaca', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer', color: '#dc2626' }}>
                      {deletingId === p.id ? '...' : 'Удалить'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && policies.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>Правил пока нет</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
