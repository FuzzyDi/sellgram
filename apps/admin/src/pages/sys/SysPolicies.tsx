import React, { useEffect, useState } from 'react';
import { systemApi } from '../../api/system-admin-client';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Input from '../../components/Input';
import Select from '../../components/Select';
import Badge, { BadgeVariant } from '../../components/Badge';
import Table, { TableColumn } from '../../components/Table';

const SCOPES = ['SALE', 'REFUND', 'PAYMENT', 'MARKING', 'SHIFT', 'DISCOUNT', 'CASHIER', 'PRINT'] as const;
const SEVERITIES = ['BLOCK', 'WARN', 'REQUIRE_MANAGER', 'REQUIRE_ACTION', 'INFO'] as const;

const SEVERITY_VARIANT: Record<string, BadgeVariant> = {
  BLOCK: 'danger',
  WARN: 'warning',
  REQUIRE_MANAGER: 'warning',
  REQUIRE_ACTION: 'warning',
  INFO: 'neutral',
};

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
    systemApi.platformPolicyVersion().then((d) => setVersion(d.version)).catch(() => showNotice('❌ Не удалось загрузить версию политик'));
  }

  function load() {
    setLoading(true);
    systemApi.platformPolicies().then(setPolicies).catch(() => showNotice('❌ Не удалось загрузить правила')).finally(() => setLoading(false));
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

  const columns: TableColumn<any>[] = [
    { key: 'scope', header: 'Scope', render: (p) => <Badge variant="info">{p.scope}</Badge> },
    { key: 'severity', header: 'Severity', render: (p) => <Badge variant={SEVERITY_VARIANT[p.severity] || 'neutral'}>{p.severity}</Badge> },
    { key: 'enabled', header: 'Статус', render: (p) => <Badge variant={p.enabled ? 'success' : 'neutral'}>{p.enabled ? 'Включено' : 'Выключено'}</Badge> },
    {
      key: 'message',
      header: 'Правило',
      render: (p) => <span className="block max-w-[360px] overflow-hidden text-ellipsis whitespace-nowrap">{p.message?.ru || '—'}</span>,
    },
    {
      key: 'actions',
      header: '',
      render: (p) => (
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => openEdit(p)}>Редактировать</Button>
          <Button variant="danger" size="sm" onClick={() => remove(p.id)} disabled={deletingId === p.id}>
            {deletingId === p.id ? '...' : 'Удалить'}
          </Button>
        </div>
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

      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="m-0 text-token-2xl font-extrabold text-neutral-900">Платформенные политики</h1>
          <p className="mt-1 mb-0 text-neutral-400 text-token-sm">Глобальные правила для POS (docs/POS_POLICY_ENGINE.md §11)</p>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="flex items-center gap-1.5 text-token-xs text-neutral-500">
            policiesVersion: <b className="text-neutral-900">{version ?? '—'}</b>
            <button onClick={loadVersion} title="Обновить версию"
              className="bg-transparent border border-neutral-200 rounded-token-sm px-2 py-0.5 text-token-xs cursor-pointer text-neutral-600">
              ↻
            </button>
          </span>
          <Button variant="primary" onClick={openCreate}>+ Новое правило</Button>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-slate-900/45">
          <Card className="w-[520px] max-w-[95vw] max-h-[90vh] overflow-y-auto shadow-2xl" style={{ padding: 24 }}>
            <h3 className="mb-4 text-token-lg font-extrabold">
              {editing ? 'Редактировать правило' : 'Новое правило'}
            </h3>

            {formError && (
              <div className="bg-danger/10 text-danger rounded-token-md px-3 py-2 text-token-sm font-semibold mb-3.5">
                {formError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2.5 mb-2.5">
              <Select label="Scope" value={form.scope} onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value }))}>
                {SCOPES.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
              <Select label="Severity" value={form.severity} onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value }))}>
                {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </div>

            <label className="flex items-center gap-2 text-token-sm font-semibold mb-3.5">
              <input type="checkbox" checked={form.enabled} onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))} />
              Правило активно
            </label>

            <div className="mb-2.5">
              <Input
                label="Текст правила (RU)"
                value={form.messageRu}
                onChange={(e) => setForm((f) => ({ ...f, messageRu: e.target.value }))}
                placeholder="Например: Табак и алкоголь нельзя продавать за наличные"
              />
            </div>
            <div className="mb-3.5">
              <Input
                label="Текст правила (UZ)"
                value={form.messageUz}
                onChange={(e) => setForm((f) => ({ ...f, messageUz: e.target.value }))}
                placeholder="Masalan: Tamaki va alkogolni naqd pulga sotib bo'lmaydi"
              />
            </div>

            <div className="mb-3.5">
              <label className="block text-token-xs font-bold text-neutral-700 mb-1">
                match (JSON) — условие срабатывания правила
              </label>
              <textarea value={form.matchText} onChange={(e) => setForm((f) => ({ ...f, matchText: e.target.value }))}
                rows={4} spellCheck={false}
                className="w-full box-border border border-neutral-300 rounded-token-md px-3 py-2 text-token-xs font-mono resize-y focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500" />
            </div>

            <div className="mb-1">
              <label className="block text-token-xs font-bold text-neutral-700 mb-1">
                extra (JSON, необязательно) — доп. поля вроде denyPayments
              </label>
              <textarea value={form.extraText} onChange={(e) => setForm((f) => ({ ...f, extraText: e.target.value }))}
                rows={3} spellCheck={false} placeholder='{"denyPayments":["CASH"]}'
                className="w-full box-border border border-neutral-300 rounded-token-md px-3 py-2 text-token-xs font-mono resize-y focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500" />
            </div>

            <div className="flex gap-2 mt-4">
              <Button variant="primary" onClick={submitForm} disabled={saving}>
                {saving ? '...' : editing ? 'Сохранить' : 'Создать'}
              </Button>
              <Button variant="ghost" onClick={() => setShowForm(false)} disabled={saving}>Отмена</Button>
            </div>
          </Card>
        </div>
      )}

      <Table columns={columns} data={policies} rowKey={(p) => p.id} loading={loading} emptyMessage="Правил пока нет" />
    </div>
  );
}
