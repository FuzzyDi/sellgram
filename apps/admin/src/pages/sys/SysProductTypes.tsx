import React, { useEffect, useState } from 'react';
import { systemApi } from '../../api/system-admin-client';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Input from '../../components/Input';
import Select from '../../components/Select';
import Badge from '../../components/Badge';
import Table, { TableColumn } from '../../components/Table';

const WEIGHT_MODES = ['PIECE', 'WEIGHT', 'PIECE_WEIGHT'] as const;

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

  const columns: TableColumn<any>[] = [
    { key: 'code', header: 'Код', render: (t) => <span className="font-mono font-bold">{t.code}</span> },
    { key: 'name', header: 'Название', render: (t) => t.name },
    { key: 'parent', header: 'Родитель', render: (t) => <span className="text-neutral-400">{t.parentTypeId ? (codeById.get(t.parentTypeId) || '—') : '—'}</span> },
    { key: 'weightMode', header: 'Weight mode', render: (t) => <Badge variant="info">{t.weightMode}</Badge> },
    { key: 'isSystem', header: 'Тип', render: (t) => <Badge variant={t.isSystem ? 'warning' : 'neutral'}>{t.isSystem ? 'Системный' : 'Кастомный'}</Badge> },
    { key: 'enabled', header: 'Статус', render: (t) => <Badge variant={t.enabled ? 'success' : 'neutral'}>{t.enabled ? 'Включён' : 'Выключен'}</Badge> },
    { key: 'rules', header: 'Правил', render: (t) => <span className="text-neutral-500">{Array.isArray(t.rules) ? t.rules.length : 0}</span> },
    {
      key: 'actions',
      header: '',
      render: (t) => (
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => openEdit(t)}>Редактировать</Button>
          {!t.isSystem && (
            <Button variant="danger" size="sm" onClick={() => remove(t)} disabled={deletingId === t.id}>
              {deletingId === t.id ? '...' : 'Удалить'}
            </Button>
          )}
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
          <h1 className="m-0 text-token-2xl font-extrabold text-neutral-900">Типы товаров</h1>
          <p className="mt-1 mb-0 text-neutral-400 text-token-sm">Глобальный справочник (docs/PRODUCT_TYPES.md §11)</p>
        </div>
        <Button variant="primary" onClick={openCreate}>+ Новый тип</Button>
      </div>

      {/* Create modal — only reachable for non-system types (isSystem is server-forced false) */}
      {showCreate && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-slate-900/45">
          <Card className="w-[520px] max-w-[95vw] max-h-[90vh] overflow-y-auto shadow-2xl" style={{ padding: 24 }}>
            <h3 className="mb-4 text-token-lg font-extrabold">Новый тип товара</h3>

            {createError && (
              <div className="bg-danger/10 text-danger rounded-token-md px-3 py-2 text-token-sm font-semibold mb-3.5">
                {createError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2.5 mb-2.5">
              <Input label="Код" value={createForm.code} onChange={(e) => setCreateForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="CUSTOM_TYPE" />
              <Input label="Название" value={createForm.name} onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))} />
            </div>

            <div className="mb-2.5">
              <Input label="Описание" value={createForm.description} onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))} />
            </div>

            <div className="grid grid-cols-2 gap-2.5 mb-2.5">
              <Select label="Родительский тип" value={createForm.parentTypeId} onChange={(e) => setCreateForm((f) => ({ ...f, parentTypeId: e.target.value }))}>
                <option value="">— нет —</option>
                {types.map((t) => <option key={t.id} value={t.id}>{t.code} — {t.name}</option>)}
              </Select>
              <Select label="Weight mode" value={createForm.weightMode} onChange={(e) => setCreateForm((f) => ({ ...f, weightMode: e.target.value }))}>
                {WEIGHT_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-2.5 mb-2.5">
              <Input label="Barcode-префиксы (через запятую)" value={createForm.barcodePrefixesText} onChange={(e) => setCreateForm((f) => ({ ...f, barcodePrefixesText: e.target.value }))} placeholder="22, 23" />
              <Input label="Mark type" value={createForm.markType} onChange={(e) => setCreateForm((f) => ({ ...f, markType: e.target.value }))} placeholder="ALCOHOL" />
            </div>

            <div className="mb-2.5">
              <label className="block text-token-xs font-bold text-neutral-700 mb-1">rules (JSON-массив)</label>
              <textarea value={createForm.rulesText} onChange={(e) => setCreateForm((f) => ({ ...f, rulesText: e.target.value }))}
                rows={5} spellCheck={false}
                className="w-full box-border border border-neutral-300 rounded-token-md px-3 py-2 text-token-xs font-mono resize-y focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500" />
            </div>

            <div className="grid grid-cols-2 gap-2.5 mb-3.5 items-end">
              <Input label="sortOrder" value={createForm.sortOrder} onChange={(e) => setCreateForm((f) => ({ ...f, sortOrder: e.target.value }))} />
              <label className="flex items-center gap-2 text-token-sm font-semibold pb-2">
                <input type="checkbox" checked={createForm.enabled} onChange={(e) => setCreateForm((f) => ({ ...f, enabled: e.target.checked }))} />
                Активен
              </label>
            </div>

            <div className="flex gap-2 mt-4">
              <Button variant="primary" onClick={submitCreate} disabled={saving}>{saving ? '...' : 'Создать'}</Button>
              <Button variant="ghost" onClick={() => setShowCreate(false)} disabled={saving}>Отмена</Button>
            </div>
          </Card>
        </div>
      )}

      {/* Edit modal — for both system and non-system types, but only name/description/enabled/rules/sortOrder are editable */}
      {editing && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-slate-900/45">
          <Card className="w-[520px] max-w-[95vw] max-h-[90vh] overflow-y-auto shadow-2xl" style={{ padding: 24 }}>
            <h3 className="mb-1 text-token-lg font-extrabold">Редактировать: {editing.code}</h3>
            <p className="mb-4 text-token-xs text-neutral-400">
              Код, родитель, weightMode, barcode-префиксы и markType фиксированы после создания.
            </p>

            {editError && (
              <div className="bg-danger/10 text-danger rounded-token-md px-3 py-2 text-token-sm font-semibold mb-3.5">
                {editError}
              </div>
            )}

            <div className="mb-2.5">
              <Input label="Название" value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="mb-2.5">
              <Input label="Описание" value={editForm.description} onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))} />
            </div>

            <div className="mb-2.5">
              <label className="block text-token-xs font-bold text-neutral-700 mb-1">rules (JSON-массив)</label>
              <textarea value={editForm.rulesText} onChange={(e) => setEditForm((f) => ({ ...f, rulesText: e.target.value }))}
                rows={6} spellCheck={false}
                className="w-full box-border border border-neutral-300 rounded-token-md px-3 py-2 text-token-xs font-mono resize-y focus:outline-none focus:ring-2 focus:ring-accent-500/30 focus:border-accent-500" />
            </div>

            <div className="grid grid-cols-2 gap-2.5 mb-3.5 items-end">
              <Input label="sortOrder" value={editForm.sortOrder} onChange={(e) => setEditForm((f) => ({ ...f, sortOrder: e.target.value }))} />
              <label className="flex items-center gap-2 text-token-sm font-semibold pb-2">
                <input type="checkbox" checked={editForm.enabled} onChange={(e) => setEditForm((f) => ({ ...f, enabled: e.target.checked }))} />
                Активен
              </label>
            </div>

            <div className="flex gap-2 mt-4">
              <Button variant="primary" onClick={submitEdit} disabled={saving}>{saving ? '...' : 'Сохранить'}</Button>
              <Button variant="ghost" onClick={() => setEditing(null)} disabled={saving}>Отмена</Button>
            </div>
          </Card>
        </div>
      )}

      <Table columns={columns} data={types} rowKey={(t) => t.id} loading={loading} emptyMessage="Типов пока нет" />
    </div>
  );
}
