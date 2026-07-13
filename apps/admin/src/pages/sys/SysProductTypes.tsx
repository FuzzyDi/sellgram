import React, { useEffect, useState } from 'react';
import { systemApi } from '../../api/system-admin-client';

const WEIGHT_MODES = ['PIECE', 'WEIGHT', 'PIECE_WEIGHT'] as const;

const WEIGHT_MODE_BADGE = { bg: '#eef2ff', color: '#4338ca' };

const SYSTEM_BADGE = {
  on: { bg: '#fef3c7', color: '#92400e' },
  off: { bg: '#f1f5f9', color: '#475569' },
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

interface CreateForm {
  code: string;
  name: string;
  description: string;
  parentTypeId: string;
  weightMode: string;
  barcodePrefixesText: string;
  markType: string;
  rulesText: string;
  enabled: boolean;
  sortOrder: string;
}

const EMPTY_CREATE_FORM: CreateForm = {
  code: '',
  name: '',
  description: '',
  parentTypeId: '',
  weightMode: 'PIECE',
  barcodePrefixesText: '',
  markType: '',
  rulesText: '[]',
  enabled: true,
  sortOrder: '0',
};

interface EditForm {
  name: string;
  description: string;
  enabled: boolean;
  rulesText: string;
  sortOrder: string;
}

function typeToEditForm(type: any): EditForm {
  return {
    name: type.name,
    description: type.description || '',
    enabled: type.enabled,
    rulesText: JSON.stringify(type.rules ?? [], null, 2),
    sortOrder: String(type.sortOrder ?? 0),
  };
}

export default function SysProductTypes() {
  const [types, setTypes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(EMPTY_CREATE_FORM);
  const [createError, setCreateError] = useState('');

  const [editing, setEditing] = useState<any | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ name: '', description: '', enabled: true, rulesText: '[]', sortOrder: '0' });
  const [editError, setEditError] = useState('');

  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function showNotice(msg: string) { setNotice(msg); setTimeout(() => setNotice(''), 3000); }

  function load() {
    setLoading(true);
    systemApi.productTypes().then(setTypes).catch(() => {}).finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  function openCreate() {
    setCreateForm(EMPTY_CREATE_FORM);
    setCreateError('');
    setShowCreate(true);
  }

  function openEdit(type: any) {
    setEditing(type);
    setEditForm(typeToEditForm(type));
    setEditError('');
  }

  async function submitCreate() {
    setCreateError('');
    if (!createForm.code.trim() || !createForm.name.trim()) {
      setCreateError('Заполните код и название');
      return;
    }
    let rules: unknown[];
    try {
      rules = JSON.parse(createForm.rulesText || '[]');
      if (!Array.isArray(rules)) throw new Error('not an array');
    } catch {
      setCreateError('rules: невалидный JSON-массив');
      return;
    }
    const sortOrder = parseInt(createForm.sortOrder, 10);
    if (Number.isNaN(sortOrder)) {
      setCreateError('sortOrder должен быть числом');
      return;
    }

    setSaving(true);
    try {
      await systemApi.createProductType({
        code: createForm.code.trim(),
        name: createForm.name.trim(),
        description: createForm.description.trim() || undefined,
        parentTypeId: createForm.parentTypeId || null,
        weightMode: createForm.weightMode,
        barcodePrefixes: createForm.barcodePrefixesText.split(',').map((s) => s.trim()).filter(Boolean),
        markType: createForm.markType.trim() || null,
        rules,
        enabled: createForm.enabled,
        sortOrder,
      });
      showNotice('✅ Тип товара создан');
      setShowCreate(false);
      load();
    } catch (e: any) {
      setCreateError(e.message || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  async function submitEdit() {
    if (!editing) return;
    setEditError('');
    let rules: unknown[];
    try {
      rules = JSON.parse(editForm.rulesText || '[]');
      if (!Array.isArray(rules)) throw new Error('not an array');
    } catch {
      setEditError('rules: невалидный JSON-массив');
      return;
    }
    const sortOrder = parseInt(editForm.sortOrder, 10);
    if (Number.isNaN(sortOrder)) {
      setEditError('sortOrder должен быть числом');
      return;
    }

    setSaving(true);
    try {
      await systemApi.updateProductType(editing.id, {
        name: editForm.name.trim(),
        description: editForm.description.trim() || null,
        enabled: editForm.enabled,
        rules,
        sortOrder,
      });
      showNotice('✅ Тип товара обновлён');
      setEditing(null);
      load();
    } catch (e: any) {
      setEditError(e.message || 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  async function remove(type: any) {
    if (!window.confirm(`Удалить тип товара «${type.name}»?`)) return;
    setDeletingId(type.id);
    try {
      await systemApi.deleteProductType(type.id);
      showNotice('✅ Тип товара удалён');
      load();
    } catch (e: any) {
      showNotice('❌ ' + e.message);
    } finally {
      setDeletingId(null);
    }
  }

  const codeById = new Map(types.map((t) => [t.id, t.code]));

  return (
    <div style={{ padding: 28 }}>
      {notice && (
        <div style={{ position: 'fixed', top: 20, right: 20, background: notice.startsWith('✅') ? '#d1fae5' : '#fee2e2', borderRadius: 8, padding: '10px 16px', fontWeight: 700, fontSize: 13, color: notice.startsWith('✅') ? '#065f46' : '#991b1b', zIndex: 999, boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }}>
          {notice}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#0f172a' }}>Типы товаров</h1>
          <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: 13 }}>Глобальный справочник (docs/PRODUCT_TYPES.md §11)</p>
        </div>
        <button onClick={openCreate} style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
          + Новый тип
        </button>
      </div>

      {/* Create modal — only reachable for non-system types (isSystem is server-forced false) */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,23,42,0.45)' }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 520, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.35)' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 800 }}>Новый тип товара</h3>

            {createError && (
              <div style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontWeight: 600, marginBottom: 14 }}>
                {createError}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 4 }}>Код</label>
                <input value={createForm.code} onChange={(e) => setCreateForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                  placeholder="CUSTOM_TYPE"
                  style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 13 }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 4 }}>Название</label>
                <input value={createForm.name} onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                  style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 13 }} />
              </div>
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 4 }}>Описание</label>
              <input value={createForm.description} onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
                style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 13 }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 4 }}>Родительский тип</label>
                <select value={createForm.parentTypeId} onChange={(e) => setCreateForm((f) => ({ ...f, parentTypeId: e.target.value }))}
                  style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 13, background: '#fff' }}>
                  <option value="">— нет —</option>
                  {types.map((t) => <option key={t.id} value={t.id}>{t.code} — {t.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 4 }}>Weight mode</label>
                <select value={createForm.weightMode} onChange={(e) => setCreateForm((f) => ({ ...f, weightMode: e.target.value }))}
                  style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 13, background: '#fff' }}>
                  {WEIGHT_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 4 }}>Barcode-префиксы (через запятую)</label>
                <input value={createForm.barcodePrefixesText} onChange={(e) => setCreateForm((f) => ({ ...f, barcodePrefixesText: e.target.value }))}
                  placeholder="22, 23"
                  style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 13 }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 4 }}>Mark type</label>
                <input value={createForm.markType} onChange={(e) => setCreateForm((f) => ({ ...f, markType: e.target.value }))}
                  placeholder="ALCOHOL"
                  style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 13 }} />
              </div>
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 4 }}>rules (JSON-массив)</label>
              <textarea value={createForm.rulesText} onChange={(e) => setCreateForm((f) => ({ ...f, rulesText: e.target.value }))}
                rows={5} spellCheck={false}
                style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 12, fontFamily: 'monospace', resize: 'vertical' }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14, alignItems: 'end' }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 4 }}>sortOrder</label>
                <input value={createForm.sortOrder} onChange={(e) => setCreateForm((f) => ({ ...f, sortOrder: e.target.value }))}
                  style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 13 }} />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, paddingBottom: 8 }}>
                <input type="checkbox" checked={createForm.enabled} onChange={(e) => setCreateForm((f) => ({ ...f, enabled: e.target.checked }))} />
                Активен
              </label>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={submitCreate} disabled={saving}
                style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                {saving ? '...' : 'Создать'}
              </button>
              <button onClick={() => setShowCreate(false)} disabled={saving}
                style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, padding: '9px 14px', cursor: 'pointer', fontSize: 13 }}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal — for both system and non-system types, but only name/description/enabled/rules/sortOrder are editable */}
      {editing && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,23,42,0.45)' }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 520, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.35)' }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 800 }}>Редактировать: {editing.code}</h3>
            <p style={{ margin: '0 0 16px', fontSize: 12, color: '#94a3b8' }}>
              Код, родитель, weightMode, barcode-префиксы и markType фиксированы после создания.
            </p>

            {editError && (
              <div style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontWeight: 600, marginBottom: 14 }}>
                {editError}
              </div>
            )}

            <div style={{ marginBottom: 10 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 4 }}>Название</label>
              <input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 13 }} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 4 }}>Описание</label>
              <input value={editForm.description} onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 13 }} />
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 4 }}>rules (JSON-массив)</label>
              <textarea value={editForm.rulesText} onChange={(e) => setEditForm((f) => ({ ...f, rulesText: e.target.value }))}
                rows={6} spellCheck={false}
                style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 12, fontFamily: 'monospace', resize: 'vertical' }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14, alignItems: 'end' }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 4 }}>sortOrder</label>
                <input value={editForm.sortOrder} onChange={(e) => setEditForm((f) => ({ ...f, sortOrder: e.target.value }))}
                  style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 13 }} />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, paddingBottom: 8 }}>
                <input type="checkbox" checked={editForm.enabled} onChange={(e) => setEditForm((f) => ({ ...f, enabled: e.target.checked }))} />
                Активен
              </label>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={submitEdit} disabled={saving}
                style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                {saving ? '...' : 'Сохранить'}
              </button>
              <button onClick={() => setEditing(null)} disabled={saving}
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
              {['Код', 'Название', 'Родитель', 'Weight mode', 'Тип', 'Статус', 'Правил', ''].map((h) => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && [1, 2, 3].map((i) => (
              <tr key={i}><td colSpan={8} style={{ padding: 14 }}><div className="animate-pulse bg-neutral-200 rounded" style={{ height: 14, width: '60%' }} /></td></tr>
            ))}
            {!loading && types.map((t: any) => (
              <tr key={t.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontWeight: 700 }}>{t.code}</td>
                <td style={{ padding: '10px 14px' }}>{t.name}</td>
                <td style={{ padding: '10px 14px', color: '#94a3b8' }}>{t.parentTypeId ? (codeById.get(t.parentTypeId) || '—') : '—'}</td>
                <td style={{ padding: '10px 14px' }}><Badge label={t.weightMode} style={WEIGHT_MODE_BADGE} /></td>
                <td style={{ padding: '10px 14px' }}>
                  <Badge label={t.isSystem ? 'Системный' : 'Кастомный'} style={t.isSystem ? SYSTEM_BADGE.on : SYSTEM_BADGE.off} />
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <Badge label={t.enabled ? 'Включён' : 'Выключен'} style={t.enabled ? ENABLED_BADGE.on : ENABLED_BADGE.off} />
                </td>
                <td style={{ padding: '10px 14px', color: '#64748b' }}>{Array.isArray(t.rules) ? t.rules.length : 0}</td>
                <td style={{ padding: '10px 14px' }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => openEdit(t)}
                      style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer', color: '#475569' }}>
                      Редактировать
                    </button>
                    {!t.isSystem && (
                      <button onClick={() => remove(t)} disabled={deletingId === t.id}
                        style={{ background: 'none', border: '1px solid #fecaca', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer', color: '#dc2626' }}>
                        {deletingId === t.id ? '...' : 'Удалить'}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!loading && types.length === 0 && (
              <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>Типов пока нет</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
